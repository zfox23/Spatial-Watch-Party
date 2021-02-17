let tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
let firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

let streamingVideoPlayerContainer = document.querySelector(".streamingVideoPlayerContainer");
let closeStreamingVideoButton = document.querySelector(".closeStreamingVideoButton");
let maximizeStreamingVideoButton = document.querySelector(".maximizeStreamingVideoButton");
let videoURLInput = document.querySelector('.videoURLInput');
videoURLInput.addEventListener("input", (e) => {
    onVideoURLInputChanged(e);
});

function onVideoURLInputChanged(e) {
    let newValue = e.target.value;
    
    let url;
    try {
        url = new URL(newValue);
    } catch (e) {
        return;
    }

    if (maybeEnqueueNewVideo(url)) {
        e.target.value = `Got it!`;
        setTimeout(() => {
            e.target.value = ``;
        }, 800);
    }
}

let youTubePlayer;
function onYouTubeIframeAPIReady() {
    youTubePlayer = new YT.Player('youTubePlayerElement', {
        height: '100%',
        width: '100%',
        playerVars: { 'autoplay': false, 'controls': true },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady(event) {

}

function onPlayerError(event) {

}

function onPlayerStateChange(event) {
    console.log(`New YouTube Player State: ${event.data}`);

    socket.emit("newPlayerState", myProvidedUserID, event.data, youTubePlayer.getCurrentTime(), spaceName);

    switch (event.data) {
        case (YT.PlayerState.PLAYING):
            if (streamingVideoPlayerContainer.classList.contains("displayNone")) {
                console.log(`Showing YouTube player...`);
                streamingVideoPlayerContainer.classList.remove("displayNone");
                let boundingClientRect = streamingVideoPlayerContainer.getBoundingClientRect();
                let position = {
                    "x": Math.round(window.innerWidth / 2 - boundingClientRect.width / 2),
                    "y": Math.round(window.innerHeight / 2 - boundingClientRect.height / 2)
                };
                streamingVideoPlayerContainer.style.left = `${position.x}px`;
                streamingVideoPlayerContainer.style.top = `${position.y}px`;
            }
            break;
        case (YT.PlayerState.CUED):
            break;
    }
}

const socket = io('http://localhost:8081');

function initWatchVideoLogic() {
    socket.emit("addWatcher", myProvidedUserID, spaceName);
}

function stopWatchVideoLogic() {
    socket.emit("removeWatcher", myProvidedUserID, spaceName);
    onStopVideoRequested();
}

let seekTimeout;
let lastPlayerTime = -1;
let CHECK_PLAYER_TIME_TIMEOUT_MS = 1000;
function runSeekDetector() {
    seekTimeout = undefined;

    if (lastPlayerTime !== -1) {
        if (youTubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
            let currentTime = youTubePlayer.getCurrentTime();

            socket.emit("setSeekTime", myProvidedUserID, currentTime, spaceName);

            // Expecting 1 second interval with 500ms margin of error
            if (Math.abs(currentTime - lastPlayerTime - 1) > 0.5) {
                // A seek probably happened!
                console.log(`Seek detected! Requesting video seek to ${currentTime}s...`);
                socket.emit("requestVideoSeek", myProvidedUserID, currentTime, spaceName);
            }
        }
    } else {
        console.log(`Starting video seek detector...`);
    }

    lastPlayerTime = youTubePlayer.getCurrentTime();

    seekTimeout = setTimeout(runSeekDetector, CHECK_PLAYER_TIME_TIMEOUT_MS);
}

function stopSeekDetector() {
    if (seekTimeout) {
        clearTimeout(seekTimeout);
    }
    seekTimeout = undefined;
    lastPlayerTime = -1;
}

socket.on("watchNewYouTubeVideo", (youTubeVideoID, seekTimeSeconds) => {
    if (youTubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        return;
    }

    console.log(`Loading YouTube video with ID \`${youTubeVideoID}\`...`);
    youTubePlayer.loadVideoById(youTubeVideoID, seekTimeSeconds);

    stopSeekDetector();
    seekTimeout = setTimeout(runSeekDetector, CHECK_PLAYER_TIME_TIMEOUT_MS); // Delay the detector start.
});

socket.on("videoSeek", (providedUserID, seekTimeSeconds) => {
    stopSeekDetector();
    seekTimeout = setTimeout(runSeekDetector, CHECK_PLAYER_TIME_TIMEOUT_MS); // Delay the detector start.
    console.log(`\`${providedUserID}\` requested video seek to ${seekTimeSeconds} seconds.`);
    youTubePlayer.seekTo(seekTimeSeconds);
});

socket.on("videoPause", (providedUserID, seekTimeSeconds) => {
    stopSeekDetector();
    console.log(`\`${providedUserID}\` paused the video.`);
    youTubePlayer.pauseVideo();
    youTubePlayer.seekTo(seekTimeSeconds);
});

socket.on("videoPlay", (providedUserID, seekTimeSeconds) => {
    stopSeekDetector();
    seekTimeout = setTimeout(runSeekDetector, CHECK_PLAYER_TIME_TIMEOUT_MS); // Delay the detector start.
    console.log(`\`${providedUserID}\` started playing the video.`);
    youTubePlayer.seekTo(seekTimeSeconds);
    youTubePlayer.playVideo();
});

function maybeEnqueueNewVideo(url) {
    if (!hifiCommunicator) {
        return false;
    }

    let youTubeVideoID;
    if (url.hostname === "youtu.be") {
        youTubeVideoID = url.pathname.substr(1);
    } else if (url.hostname === "www.youtube.com" || url.hostname === "youtube.com") {
        const params = new URLSearchParams(url.search);
        youTubeVideoID = params.get("v");
    }

    if (youTubeVideoID && youTubeVideoID.length > 1) {
        console.log(`User pasted YouTube video URL!\n${url}`);
        socket.emit("enqueueNewVideo", myProvidedUserID, url, spaceName);
        return true;
    }

    return false;
}

document.addEventListener('paste', (event) => {
    let paste = (event.clipboardData || window.clipboardData).getData('text');
    let url;
    try {
        url = new URL(paste);
    } catch (e) {
        return;
    }

    maybeEnqueueNewVideo(url);
});

function onStopVideoRequested(providedUserID) {
    console.log(`\`${providedUserID}\` requested that video playback be stopped.`);

    youTubePlayer.stopVideo();

    stopSeekDetector();

    streamingVideoPlayerContainer.classList.add("displayNone");
}

socket.on("stopVideoRequested", (providedUserID) => {
    onStopVideoRequested(providedUserID);
});

closeStreamingVideoButton.addEventListener("click", (e) => {
    console.log(`You requested that video playback be stopped.`);
    socket.emit("stopVideo", myProvidedUserID, spaceName);
    onStopVideoRequested(myProvidedUserID);
});

maximizeStreamingVideoButton.addEventListener("click", (e) => {
    streamingVideoPlayerContainer.classList.toggle("streamingVideoPlayerContainer--maximized");
});