let cursorStartClientPosition = {
    "x": 0,
    "y": 0,
};
let cursorDistanceFromTopLeftOfVideoContainer = {
    "x": 0,
    "y": 0
};
let videoContainerToMove = undefined;
const CONTROLS_CONTAINER_HEIGHT_PX = 60;
const VIDEO_TITLE_BAR_HEIGHT_PX = 40;

allVideosContainer.addEventListener("mousedown", e => {
    if (e.target.classList.contains("videoTitleBar") && e.target.parentElement) {
        videoContainerToMove = e.target.parentElement;
        let videoContainerBoundingClientRect = videoContainerToMove.getBoundingClientRect();
        cursorStartClientPosition.x = e.clientX;
        cursorStartClientPosition.y = e.clientY;
        cursorDistanceFromTopLeftOfVideoContainer.x = cursorStartClientPosition.x - videoContainerBoundingClientRect.left;
        cursorDistanceFromTopLeftOfVideoContainer.y = cursorStartClientPosition.y - videoContainerBoundingClientRect.top;
    }
});

allVideosContainer.addEventListener("mousemove", e => {
    if (!videoContainerToMove) {
        return;
    }

    let newPosition = {
        "x": e.clientX - cursorDistanceFromTopLeftOfVideoContainer.x,
        "y": e.clientY - cursorDistanceFromTopLeftOfVideoContainer.y
    };
    
    videoContainerToMove.style.left = `${Math.round(newPosition.x)}px`;
    videoContainerToMove.style.top = `${Math.round(newPosition.y)}px`;
});

function onMouseUp(e) {
    if (videoContainerToMove) {
        let videoContainerBoundingClientRect = videoContainerToMove.getBoundingClientRect();
        let relativeParticipantVideoContainerPosition = {
            "x": videoContainerBoundingClientRect.left,
            "y": videoContainerBoundingClientRect.top
        };

        updateMyPosition({
            "x": linearScale(relativeParticipantVideoContainerPosition.x + videoContainerBoundingClientRect.width / 2, 0, window.innerWidth, -virtualSpaceDimensions.x / 2, virtualSpaceDimensions.x / 2),
            "y": -1 * linearScale(relativeParticipantVideoContainerPosition.y + CONTROLS_CONTAINER_HEIGHT_PX + VIDEO_TITLE_BAR_HEIGHT_PX + videoContainerBoundingClientRect.height / 2, CONTROLS_CONTAINER_HEIGHT_PX, window.innerHeight, -virtualSpaceDimensions.y / 2, virtualSpaceDimensions.y / 2)
        });
    }
    videoContainerToMove = undefined;

    cursorStartClientPosition.x = 0;
    cursorStartClientPosition.y = 0;
    
    cursorDistanceFromTopLeftOfVideoContainer.x = 0;
    cursorDistanceFromTopLeftOfVideoContainer.y = 0;
}

allVideosContainer.addEventListener("mouseup", e => {
    onMouseUp(e);
});

allVideosContainer.addEventListener("mouseleave", e => {
    onMouseUp(e);
});
