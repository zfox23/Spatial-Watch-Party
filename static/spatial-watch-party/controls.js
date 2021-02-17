let cursorStartClientPosition = {
    "x": 0,
    "y": 0,
};
let cursorDistanceFromTopLeftOfElement = {
    "x": 0,
    "y": 0
};
let elementToMove = undefined;
const CONTROLS_CONTAINER_HEIGHT_PX = 60;
const VIDEO_TITLE_BAR_HEIGHT_PX = 40;

allVideosContainer.addEventListener("mousedown", e => {
    let closest = e.target.closest(".participantVideoContainer--mine") || e.target.closest(".streamingVideoPlayerContainer");
    if (closest) {
        elementToMove = closest;
        let boundingClientRect = elementToMove.getBoundingClientRect();
        cursorStartClientPosition.x = e.clientX;
        cursorStartClientPosition.y = e.clientY;
        cursorDistanceFromTopLeftOfElement.x = cursorStartClientPosition.x - boundingClientRect.left;
        cursorDistanceFromTopLeftOfElement.y = cursorStartClientPosition.y - boundingClientRect.top;
    }
});

allVideosContainer.addEventListener("mousemove", e => {
    if (!elementToMove) {
        return;
    }

    let newPosition = {
        "x": e.clientX - cursorDistanceFromTopLeftOfElement.x,
        "y": e.clientY - cursorDistanceFromTopLeftOfElement.y
    };
    
    elementToMove.style.left = `${Math.round(newPosition.x)}px`;
    elementToMove.style.top = `${Math.round(newPosition.y)}px`;

    let boundingClientRect = elementToMove.getBoundingClientRect();
    let relativeParticipantVideoContainerPosition = {
        "x": boundingClientRect.left,
        "y": boundingClientRect.top
    };

    if (elementToMove.classList.contains("participantVideoContainer--mine")) {
        updateMyPosition({
            "x": linearScale(relativeParticipantVideoContainerPosition.x + boundingClientRect.width / 2, 0, window.innerWidth, -virtualSpaceDimensions.x / 2, virtualSpaceDimensions.x / 2),
            "y": -1 * linearScale(relativeParticipantVideoContainerPosition.y + CONTROLS_CONTAINER_HEIGHT_PX + VIDEO_TITLE_BAR_HEIGHT_PX + boundingClientRect.height / 2, CONTROLS_CONTAINER_HEIGHT_PX, window.innerHeight, -virtualSpaceDimensions.y / 2, virtualSpaceDimensions.y / 2)
        }, false);
    }
});

function onMouseUp(e) {
    elementToMove = undefined;

    cursorStartClientPosition.x = 0;
    cursorStartClientPosition.y = 0;
    
    cursorDistanceFromTopLeftOfElement.x = 0;
    cursorDistanceFromTopLeftOfElement.y = 0;
}

allVideosContainer.addEventListener("mouseup", e => {
    onMouseUp(e);
});

allVideosContainer.addEventListener("mouseleave", e => {
    onMouseUp(e);
});
