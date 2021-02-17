var mainCanvas = document.querySelector(".mainCanvas");
var ctx = mainCanvas.getContext("2d");

const CIRCLE_INFO = [
    {
        radius: 0.25,
        color: "#DFC2F2",
    },
    {
        radius: 0.5,
        color: "#CFB3CD",
    },
    {
        radius: 1.0,
        color: "#888098",
    },
    {
        radius: 2.0,
        color: "#344055",
    },
];
const CIRCLE_LABEL_PADDING_PX = 26;
const CIRCLE_LABEL_COLOR_HEX = "#BBBBBB";
const CIRCLE_LABEL_FONT = '18px sans-serif';

function updateCanvas() {
    if (!allUserData) {
        return;
    }

    let myUserData = allUserData.find((element) => { return element.providedUserID === myProvidedUserID; });
    if (!myUserData || !myUserData.position || !virtualSpaceDimensions.x || !virtualSpaceDimensions.y) {
        return;
    }

    let myPositionInCanvasSpace = {
        "x": Math.round(linearScale(myUserData.position.x, -virtualSpaceDimensions.x / 2, virtualSpaceDimensions.x / 2, 0, mainCanvas.width)),
        // We "reverse" the last two terms here because "-y" in canvas space is "+y" in mixer space.
        "y": Math.round(linearScale(myUserData.position.y, -virtualSpaceDimensions.y / 2, virtualSpaceDimensions.y / 2, mainCanvas.height, 0))
    };

    let pixelsPerMeter = Math.round(mainCanvas.width / virtualSpaceDimensions.x);

    ctx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    ctx.font = CIRCLE_LABEL_FONT;
    ctx.fillStyle = CIRCLE_LABEL_COLOR_HEX;

    for (const circleInfo of CIRCLE_INFO) {
        ctx.strokeStyle = circleInfo.color;
        let circleRadiusM = circleInfo.radius;
        let circleRadiusPX = pixelsPerMeter * circleRadiusM;
        ctx.beginPath();
        ctx.arc(myPositionInCanvasSpace.x, myPositionInCanvasSpace.y, circleRadiusPX, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.textAlign = "center";
        ctx.fillText(`${circleRadiusM}m`, myPositionInCanvasSpace.x, myPositionInCanvasSpace.y - circleRadiusPX + CIRCLE_LABEL_PADDING_PX);
        ctx.fillText(`${circleRadiusM}m`, myPositionInCanvasSpace.x, myPositionInCanvasSpace.y + circleRadiusPX - CIRCLE_LABEL_PADDING_PX);
        ctx.textAlign = "start";
        ctx.fillText(`${circleRadiusM}m`, myPositionInCanvasSpace.x - circleRadiusPX + CIRCLE_LABEL_PADDING_PX, myPositionInCanvasSpace.y);
        ctx.textAlign = "end";
        ctx.fillText(`${circleRadiusM}m`, myPositionInCanvasSpace.x + circleRadiusPX - CIRCLE_LABEL_PADDING_PX, myPositionInCanvasSpace.y);
    }
}

function updateCanvasDimensions() {
    mainCanvas.width = window.innerWidth;
    mainCanvas.height = window.innerHeight;
}
