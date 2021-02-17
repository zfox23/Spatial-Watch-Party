const { default: SignJWT } = require('jose/jwt/sign');
const express = require('express');
const crypto = require('crypto');
const auth = require('./auth.json');
const twilio = require('twilio');
const fetch = require('node-fetch');
const { ADJECTIVES, NOUNS } = require('./words');

// This is your "App ID" as obtained from the High Fidelity Audio API Developer Console. Do not share this string.
const APP_ID = auth.HIFI_APP_ID;
// This is the "App Secret" as obtained from the High Fidelity Audio API Developer Console. Do not share this string.
const APP_SECRET = auth.HIFI_APP_SECRET;
const SECRET_KEY_FOR_SIGNING = crypto.createSecretKey(Buffer.from(APP_SECRET, "utf8"));

const app = express();
const PORT = 8085;

app.set('view engine', 'ejs');
app.use(express.static('static'))

function uppercaseFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

async function generateHiFiJWT(userID, spaceID, isAdmin) {
    let hiFiJWT;
    try {
        let jwtArgs = {
            "user_id": userID,
            "app_id": APP_ID
        };

        if (spaceID) {
            jwtArgs["space_id"] = spaceID;
        }

        if (isAdmin) {
            jwtArgs["admin"] = true;
        }

        hiFiJWT = await new SignJWT(jwtArgs)
            .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
            .sign(SECRET_KEY_FOR_SIGNING);

        return hiFiJWT;
    } catch (error) {
        console.error(`Couldn't create JWT! Error:\n${error}`);
        return;
    }
}

function generateTwilioAccessToken(providedUserID, spaceName) {
    const AccessToken = twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    // Create an Access Token
    let accessToken = new AccessToken(
        auth.TWILIO_ACCOUNT_SID,
        auth.TWILIO_API_KEY_SID,
        auth.TWILIO_API_KEY_SECRET
    );

    // Set the Identity of this token
    accessToken.identity = providedUserID;

    // Grant access to Video
    let grant = new VideoGrant();
    grant.room = spaceName;
    accessToken.addGrant(grant);

    // Serialize the token as a JWT
    return accessToken.toJwt();
}

let spaceNameToIDMap = new Map();
app.get('/spatial-watch-party', async (req, res) => {
    let spaceName = req.query.room || auth.TWILIO_ROOM_NAME;

    let spaceID;
    if (spaceNameToIDMap.has(spaceName)) {
        spaceID = spaceNameToIDMap.get(spaceName);
    } else {
        let createSpaceResponse;
        try {
            createSpaceResponse = await fetch(`https://api.highfidelity.com/api/v1/spaces/create?token=${adminJWT}&name=${spaceName}`);
        } catch (e) {
            return res.status(500).send();
        }
    
        let spaceJSON;
        try {
            spaceJSON = await createSpaceResponse.json();
        } catch (e) {
            return res.status(500).send();
        }
    
        spaceID = spaceJSON["space-id"];
        spaceNameToIDMap.set(spaceName, spaceID);
    }

    console.log(`The HiFi Space ID associated with Space Name \`${spaceName}\` is \`${spaceID}\``);

    let providedUserID = `${uppercaseFirstLetter(ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)])}${uppercaseFirstLetter(NOUNS[Math.floor(Math.random() * NOUNS.length)])}${Math.floor(Math.random() * Math.floor(1000))}`;
    let hiFiJWT = await generateHiFiJWT(providedUserID, spaceID, false);
    let twilioJWT = generateTwilioAccessToken(providedUserID, spaceName);
    res.render('index', { providedUserID, hiFiJWT, twilioJWT, spaceName });
});



const http = require("http").createServer(app);

const io = require("socket.io")(http, {
    cors: {
        origin: "http://localhost:8080",
        methods: ["GET", "POST"]
    }
});

io.sockets.on("error", (e) => {
    console.error(e);
});

function onWatchNewVideo(socket, newVideoURL, spaceName) {
    if (!spaceInfo[spaceName]) {
        console.error(`In \`onWatchNewVideo()\`, no \`spaceInfo["${spaceName}"]\`!`);
        return;
    }

    let url = new URL(newVideoURL);

    let youTubeVideoID;
    if (url.hostname === "youtu.be") {
        youTubeVideoID = url.pathname.substr(1);
    } else if (url.hostname === "www.youtube.com" || url.hostname  === "youtube.com") {
        const params = new URLSearchParams(url.search);
        youTubeVideoID = params.get("v");
    }

    if (youTubeVideoID) {
        spaceInfo[spaceName].currentQueuedVideoURL = newVideoURL;
        console.log(`Emitting \`watchNewYouTubeVideo\` with Video ID \`${youTubeVideoID}\` to all users in ${spaceName}...`);

        io.sockets.in(spaceName).emit("watchNewYouTubeVideo", youTubeVideoID, spaceInfo[spaceName].currentVideoSeekTime);
    }
}

let spaceInfo = {};
io.sockets.on("connection", (socket) => {
    socket.on("addWatcher", (providedUserID, spaceName) => {
        console.log(`In ${spaceName}, adding watcher with ID \`${providedUserID}\`.`);
        socket.join(spaceName);

        if (!spaceInfo[spaceName]) {
            spaceInfo[spaceName] = {
                watcherProvidedUserIDToSocketIDMap: new Map(),
                currentQueuedVideoURL: undefined,
                currentVideoSeekTime: undefined,
                currentPlayerState: undefined,
            };
        }

        spaceInfo[spaceName].watcherProvidedUserIDToSocketIDMap.set(providedUserID, socket.id);

        if (spaceInfo[spaceName].currentQueuedVideoURL) {
            onWatchNewVideo(socket, spaceInfo[spaceName].currentQueuedVideoURL, spaceName);
        }
    });

    socket.on("removeWatcher", (providedUserID, spaceName) => {
        if (!spaceInfo[spaceName]) {
            return;
        }

        console.log(`In ${spaceName}, removing watcher with ID \`${providedUserID}\`.`);

        spaceInfo[spaceName].watcherProvidedUserIDToSocketIDMap.delete(providedUserID);

        if (spaceInfo[spaceName].watcherProvidedUserIDToSocketIDMap.size === 0) {
            delete spaceInfo[spaceName];
        }
    });

    socket.on("enqueueNewVideo", (providedUserID, newVideoURL, spaceName) => {
        if (!spaceInfo[spaceName]) {
            return;
        }

        spaceInfo[spaceName].currentVideoSeekTime = 0;

        console.log(`In ${spaceName}, \`${providedUserID}\` requested that a new video be played with URL \`${newVideoURL}\`.`);

        onWatchNewVideo(socket, newVideoURL, spaceName);
    });

    socket.on("requestVideoSeek", (providedUserID, seekTimeSeconds, spaceName) => {
        if (!spaceInfo[spaceName]) {
            return;
        }
        
        spaceInfo[spaceName].currentVideoSeekTime = seekTimeSeconds;

        console.log(`In ${spaceName}, \`${providedUserID}\` requested that the video be seeked to ${spaceInfo[spaceName].currentVideoSeekTime}s.`);
        
        io.sockets.in(spaceName).emit("videoSeek", providedUserID, spaceInfo[spaceName].currentVideoSeekTime);
    });

    socket.on("setSeekTime", (providedUserID, seekTimeSeconds, spaceName) => {
        if (!spaceInfo[spaceName]) {
            return;
        }

        spaceInfo[spaceName].currentVideoSeekTime = seekTimeSeconds;
    });

    socket.on("newPlayerState", (providedUserID, newPlayerState, seekTimeSeconds, spaceName) => {
        if (!spaceInfo[spaceName]) {
            return;
        }

        if (!(newPlayerState === 1 || newPlayerState === 2) || spaceInfo[spaceName].currentPlayerState === newPlayerState) {
            return;
        }
        
        if (newPlayerState === 2) { // YT.PlayerState.PAUSED
            console.log(`In ${spaceName}, \`${providedUserID}\` requested that the video be paused at ${seekTimeSeconds}s.`);
            socket.broadcast.to(spaceName).emit("videoPause", providedUserID, seekTimeSeconds);
        } else if (newPlayerState === 1) { // YT.PlayerState.PLAYING
            console.log(`In ${spaceName}, \`${providedUserID}\` requested that the video be played starting at ${seekTimeSeconds}s.`);
            socket.broadcast.to(spaceName).emit("videoPlay", providedUserID, seekTimeSeconds);
        }

        spaceInfo[spaceName].currentPlayerState = newPlayerState;
    });

    socket.on("stopVideo", (providedUserID, spaceName) => {
        if (!spaceInfo[spaceName]) {
            return;
        }

        spaceInfo[spaceName].currentVideoSeekTime = undefined;
        spaceInfo[spaceName].currentQueuedVideoURL = undefined;
        console.log(`In ${spaceName}, \`${providedUserID}\` requested that the video be stopped.`);
        io.sockets.in(spaceName).emit("stopVideoRequested", providedUserID);
    });
});

let adminJWT;
http.listen(PORT, async () => {
    adminJWT = await generateHiFiJWT("example-admin", undefined, true);
    console.log(`Spatial Watch Party is ready and listening at http://localhost:${PORT}\nVisit http://localhost:${PORT}/spatial-watch-party in your browser.`)
});