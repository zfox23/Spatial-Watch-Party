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
const PORT = 8080;

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
    let spaceName = req.query.space || auth.TWILIO_ROOM_NAME;

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
app.listen(PORT, async () => {
    adminJWT = await generateHiFiJWT("example-admin", undefined, true);
    console.log(`The High Fidelity Sample App is ready and listening at http://localhost:${PORT}\nVisit http://localhost:${PORT}/spatial-watch-party in your browser.`)
});