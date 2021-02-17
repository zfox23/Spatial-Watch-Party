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
const EXPRESS_PORT = 8080;

app.set('view engine', 'ejs');
app.use(express.static('static'))

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
    let spaceName = auth.TWILIO_ROOM_NAME;

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

    let providedUserID = `${ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]}-${NOUNS[Math.floor(Math.random() * NOUNS.length)]}${Math.floor(Math.random() * Math.floor(1000))}`;
    let hiFiJWT = await generateHiFiJWT(providedUserID, spaceID, false);
    let twilioJWT = generateTwilioAccessToken(providedUserID, spaceName);
    res.render('index', { providedUserID, hiFiJWT, twilioJWT, spaceName });
});

let adminJWT;
app.listen(EXPRESS_PORT, async () => {
    adminJWT = await generateHiFiJWT("example-admin", undefined, true);
    console.log(`The High Fidelity Sample App is ready and listening at http://localhost:${EXPRESS_PORT}\nVisit http://localhost:${EXPRESS_PORT}/spatial-watch-party in your browser.`)
});



const SOCKET_PORT = 8081;
const http = require("http");
const server = http.createServer();

const io = require("socket.io")(server, {
    cors: {
        origin: "http://localhost:8080",
        methods: ["GET", "POST"]
    }
});

io.sockets.on("error", (e) => {
    console.error(e);
});

function onWatchNewVideo(newVideoURL) {
    let url = new URL(newVideoURL);

    let youTubeVideoID;
    if (url.hostname === "youtu.be") {
        youTubeVideoID = url.pathname.substr(1);
    } else if (url.hostname === "www.youtube.com" || url.hostname  === "youtube.com") {
        const params = new URLSearchParams(url.search);
        youTubeVideoID = params.get("v");
    }

    if (youTubeVideoID) {
        currentQueuedVideoURL = newVideoURL;
        console.log(`Emitting \`watchNewYouTubeVideo\` with Video ID \`${youTubeVideoID}\`...`);
        io.emit("watchNewYouTubeVideo", youTubeVideoID, currentVideoSeekTime);
    }
}

let suppliedUserIDToSpaceNameMap = new Map();
let currentQueuedVideoURL;
let currentVideoSeekTime;
let currentVideoIsPlaying = false;
let currentPlayerState;
io.sockets.on("connection", (socket) => {
    socket.on("addWatcher", (suppliedUserID, spaceName) => {
        console.log(`Adding watcher with ID \`${suppliedUserID}\` to space named \`${spaceName}\`.`);
        suppliedUserIDToSpaceNameMap.set(suppliedUserID, spaceName);

        if (currentQueuedVideoURL) {
            onWatchNewVideo(currentQueuedVideoURL);
        }
    });

    socket.on("removeWatcher", (suppliedUserID) => {
        if (suppliedUserIDToSpaceNameMap.has(suppliedUserID)) {
            suppliedUserIDToSpaceNameMap.delete(suppliedUserID);
        }

        if (suppliedUserIDToSpaceNameMap.size === 0) {
            currentQueuedVideoURL = undefined;
            currentVideoSeekTime = undefined;
            currentVideoIsPlaying = false;
            currentPlayerState = undefined;
        }
    });

    socket.on("enqueueNewVideo", (newVideoURL) => {
        currentVideoSeekTime = 0;
        currentVideoIsPlaying = true;
        onWatchNewVideo(newVideoURL);
    });

    socket.on("requestVideoSeek", (suppliedUserID, seekTimeSeconds) => {
        currentVideoSeekTime = seekTimeSeconds;
        socket.broadcast.emit("videoSeek", suppliedUserID, currentVideoSeekTime);
    });

    socket.on("setSeekTime", (seekTimeSeconds) => {
        currentVideoSeekTime = seekTimeSeconds;
    });

    socket.on("newPlayerState", (suppliedUserID, newPlayerState, seekTimeSeconds) => {
        if (!(newPlayerState === 1 || newPlayerState === 2) || currentPlayerState === newPlayerState) {
            return;
        }
        
        if (newPlayerState === 2) { // YT.PlayerState.PAUSED
            currentVideoIsPlaying = false;
            socket.broadcast.emit("videoPause", suppliedUserID, seekTimeSeconds);
        } else if (newPlayerState === 1) { // YT.PlayerState.PLAYING
            currentVideoIsPlaying = true;
            socket.broadcast.emit("videoPlay", suppliedUserID, seekTimeSeconds);
        }

        currentPlayerState = newPlayerState;
    });

    socket.on("stopVideo", (providedUserID) => {
        currentVideoSeekTime = undefined;
        currentQueuedVideoURL = undefined;
        io.emit("stopVideoRequested", providedUserID);
    });
});

server.listen(SOCKET_PORT, () => console.log(`The High Fidelity Spatial Watch Party SocketIO Server is running on port ${SOCKET_PORT}`));