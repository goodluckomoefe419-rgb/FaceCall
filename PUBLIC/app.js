const socket = io();

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startCameraButton = document.getElementById("startCamera");
const joinRoomButton = document.getElementById("joinRoom");
const copyLinkButton = document.getElementById("copyLink");
const muteButton = document.getElementById("muteButton");
const cameraButton = document.getElementById("cameraButton");
const hangupButton = document.getElementById("hangupButton");
const roomInput = document.getElementById("roomId");
const statusText = document.getElementById("status");
const roomLabel = document.getElementById("roomLabel");

let localStream = null;
let peerConnection = null;
let currentRoom = "";
let isMuted = false;
let isCameraOff = false;
let otherUserId = null;

const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
    ]
};

function setStatus(message) {
    statusText.textContent = message;
}

function makeRoomId() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function createPeerConnection(targetSocketId) {
    if (peerConnection) {
        peerConnection.close();
    }

    peerConnection = new RTCPeerConnection(rtcConfig);
    otherUserId = targetSocketId || otherUserId;

    if (localStream) {
        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
        setStatus("Connected — video call is live");
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate && otherUserId) {
            socket.emit("ice-candidate", {
                target: otherUserId,
                candidate: event.candidate
            });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        if (state === "connected") {
            setStatus("Connected — video call is live");
        } else if (state === "disconnected") {
            setStatus("Connection interrupted…");
        } else if (state === "failed") {
            setStatus("Connection failed. Try joining the room again.");
        }
    };

    return peerConnection;
}

async function startCamera() {
    if (localStream) return;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = localStream;
        startCameraButton.disabled = true;
        joinRoomButton.disabled = false;
        setStatus("Camera and microphone ready");
    } catch (error) {
        console.error(error);
        alert(
            "Camera/microphone access was blocked. Please allow camera and microphone access in your browser and try again."
        );
    }
}

async function joinRoom() {
    if (!localStream) {
        await startCamera();
    }

    if (!localStream) return;

    let room = roomInput.value.trim().toUpperCase();
    if (!room) {
        room = makeRoomId();
        roomInput.value = room;
    }

    currentRoom = room;
    roomLabel.textContent = `Room: ${currentRoom}`;
    copyLinkButton.disabled = false;
    hangupButton.disabled = false;
    joinRoomButton.disabled = true;
    roomInput.disabled = true;

    socket.emit("join-room", currentRoom);
    setStatus("Joining room…");
}

async function createOffer(targetSocketId) {
    const pc = createPeerConnection(targetSocketId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("offer", {
        target: targetSocketId,
        offer: pc.localDescription
    });

    setStatus("Calling the other person…");
}

async function handleOffer({ from, offer }) {
    otherUserId = from;
    const pc = createPeerConnection(from);

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit("answer", {
        target: from,
        answer: pc.localDescription
    });

    setStatus("Connecting to the other person…");
}

async function handleAnswer({ answer }) {
    if (!peerConnection) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

async function handleIceCandidate({ candidate }) {
    if (!peerConnection) return;

    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        console.error("ICE candidate error:", error);
    }
}

function leaveCall(notifyServer = true) {
    if (notifyServer && currentRoom) {
        socket.emit("leave-room", currentRoom);
    }

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    remoteVideo.srcObject = null;
    otherUserId = null;

    if (currentRoom) {
        roomLabel.textContent = `Room: ${currentRoom}`;
    }

    hangupButton.disabled = true;
    setStatus("Call ended");
}

function resetRoom() {
    leaveCall(false);
    currentRoom = "";
    roomInput.disabled = false;
    joinRoomButton.disabled = !localStream;
    copyLinkButton.disabled = true;
    roomLabel.textContent = "No room joined";
}

startCameraButton.addEventListener("click", startCamera);
joinRoomButton.addEventListener("click", joinRoom);
hangupButton.addEventListener("click", resetRoom);

muteButton.addEventListener("click", () => {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isMuted;
    });
    muteButton.textContent = isMuted ? "Unmute" : "Mute";
});

cameraButton.addEventListener("click", () => {
    if (!localStream) return;
    isCameraOff = !isCameraOff;
    localStream.getVideoTracks().forEach((track) => {
        track.enabled = !isCameraOff;
    });
    cameraButton.textContent = isCameraOff ? "Camera On" : "Camera Off";
});

copyLinkButton.addEventListener("click", async () => {
    if (!currentRoom) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(currentRoom)}`;

    try {
        await navigator.clipboard.writeText(url);
        copyLinkButton.textContent = "Copied!";
        setTimeout(() => {
            copyLinkButton.textContent = "Copy Call Link";
        }, 1500);
    } catch {
        window.prompt("Copy this call link:", url);
    }
});

socket.on("room-created", () => {
    setStatus("Room created. Share the call link with the other person.");
});

socket.on("waiting-for-peer", () => {
    setStatus("Waiting for the other person to join…");
});

socket.on("user-joined", async (socketId) => {
    otherUserId = socketId;
    await createOffer(socketId);
});

socket.on("offer", handleOffer);
socket.on("answer", handleAnswer);
socket.on("ice-candidate", handleIceCandidate);

socket.on("user-left", () => {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    remoteVideo.srcObject = null;
    otherUserId = null;
    setStatus("The other person left the call");
});

socket.on("room-full", () => {
    alert("This room already has two people. Create a new room for another call.");
    resetRoom();
});

socket.on("connect_error", (error) => {
    console.error("Socket connection error:", error);
    setStatus("Signaling server unavailable. Make sure the Node server is running.");
});

const roomFromUrl = new URLSearchParams(window.location.search).get("room");
if (roomFromUrl) {
    roomInput.value = roomFromUrl.toUpperCase();
}
