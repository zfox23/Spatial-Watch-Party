let tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
let firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

let streamingVideoPlayerContainer = document.querySelector(".streamingVideoPlayerContainer");
let closeStreamingVideoButton = document.querySelector(".closeStreamingVideoButton");

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

    socket.emit("newPlayerState", event.data);

    switch (event.data) {
        case (YT.PlayerState.PLAYING):
            console.log(`Showing YouTube player...`);
            streamingVideoPlayerContainer.classList.remove("displayNone");
            let boundingClientRect = streamingVideoPlayerContainer.getBoundingClientRect();
            let position = {
                "x": Math.round(window.innerWidth / 2 - boundingClientRect.width / 2),
                "y": Math.round(window.innerHeight / 2 - boundingClientRect.height / 2)
            };
            streamingVideoPlayerContainer.style.left = `${position.x}px`;
            streamingVideoPlayerContainer.style.top = `${position.y}px`;
            break;
        case (YT.PlayerState.CUED):
            break;
    }
}

const socket = io('http://localhost:8081');

function initWatchVideoLogic() {
    socket.emit("addWatcher", myProvidedUserID);
}

function stopWatchVideoLogic() {
    socket.emit("removeWatcher", myProvidedUserID);
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

            socket.emit("setSeekTime", currentTime);

            // expecting 1 second interval with 500ms margin
            if (Math.abs(currentTime - lastPlayerTime - 1) > 0.5) {
                // A seek probably happened!
                console.log(`Seek detected! Requesting video seek to ${currentTime}s...`);
                socket.emit("requestVideoSeek", myProvidedUserID, currentTime);
            }
        }
    } else {
        console.log(`Starting video seek detector...`);
    }
    lastPlayerTime = youTubePlayer.getCurrentTime();
    seekTimeout = setTimeout(runSeekDetector, CHECK_PLAYER_TIME_TIMEOUT_MS);
}

socket.on("watchNewYouTubeVideo", (youTubeVideoID, seekTimeSeconds) => {
    if (youTubePlayer.getPlayerState() === YT.PlayerState.PLAYING) {
        return;
    }

    console.log(`Loading YouTube video with ID \`${youTubeVideoID}\`...`);
    youTubePlayer.loadVideoById(youTubeVideoID, seekTimeSeconds);

    seekTimeout = setTimeout(runSeekDetector, CHECK_PLAYER_TIME_TIMEOUT_MS); // Delay initial call.
});

socket.on("videoSeek", (providedUserID, seekTimeSeconds) => {
    if (seekTimeout) {
        clearTimeout(seekTimeout);
        seekTimeout = setTimeout(runSeekDetector, CHECK_PLAYER_TIME_TIMEOUT_MS);
    }
    console.log(`\`${providedUserID}\` requested video seek to ${seekTimeSeconds} seconds.`);
    youTubePlayer.seekTo(seekTimeSeconds);
});

document.addEventListener('paste', (event) => {
    let paste = (event.clipboardData || window.clipboardData).getData('text');
    let url = new URL(paste);

    let pastedYouTubeVideo = false;
    if (url.hostname === "youtu.be") {
        pastedYouTubeVideo = true;
    } else if (url.hostname === "www.youtube.com" || url.hostname === "youtube.com") {
        pastedYouTubeVideo = true;
    }

    if (pastedYouTubeVideo) {
        console.log(`User pasted YouTube video URL!\n${url}`);
        socket.emit("enqueueNewVideo", url);
    }
});

function onStopVideoRequested(providedUserID) {
    console.log(`\`${providedUserID}\` requested that video playback be stopped.`);

    youTubePlayer.stopVideo();

    if (seekTimeout) {
        clearTimeout(seekTimeout);
        seekTimeout = undefined;
    }
    lastPlayerTime = -1;

    streamingVideoPlayerContainer.classList.add("displayNone");
}

socket.on("stopVideoRequested", (providedUserID) => {
    onStopVideoRequested(providedUserID);
});

closeStreamingVideoButton.addEventListener("click", (e) => {
    console.log(`You requested that video playback be stopped.`);
    socket.emit("stopVideo", myProvidedUserID);
    onStopVideoRequested(myProvidedUserID);
});