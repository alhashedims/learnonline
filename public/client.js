/**
 * Archivo: server.js
 * Descripción: Script para plataforma de videoconferencia en WebRTC
 * 
 * Autor: Rubén Delgado González
 * Fecha: 26-2-21
 */

// Referencias a elementos del DOM
const roomSelectionContainer = document.getElementById('room-selection-container')
const roomInput = document.getElementById('room-input')
const nameInput = document.getElementById('name-input')
const connectButton = document.getElementById('connect-button')
const sendmessage = document.getElementById('chatSendBtn')

const chatInput = document.getElementById('chatInput')

const videoChatContainer = document.getElementById('student')
const localVideoComponent = document.getElementById('local-video')

// Variables.
const socket = io()
const mediaConstraints = {
  audio: true,
}
const offerOptions = {
  offerToReceiveVideo: 1,
  offerToReceiveAudio: 1,
};

/**
 * Colección con los objetos RTCPeerConnection.
 * La clave es el ID del socket (de socket.io) del par remoto y el valor es el objeto RTCPeerConnection
 * de dicho par remoto.
 */
var peerConnections = {}; 

let localPeerId; //ID del socket del cliente
let localStream;
let rtcPeerConnection // Connection between the local device and the remote peer.
let roomId; 

// Servidores ICE usados. Solo servidores STUN en este caso.
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}
$("#chatInput").keydown(function(event){
  if (event.shiftKey && event.keyCode === 13) {
  } else if (event.keyCode === 13) {
    $("#chatSendBtn").click();
  }
});

function getRoom(){
  var params = window.location.search.substr(1).split("&");
  
  if(params){
      for(let i = 0; i < params.length; i++){
          var key = params[i].split("=")[0];
          var value = params[i].split("=")[1];
          
          if(key === "room"){
              return decodeURIComponent(value);
          }
      }
  }
  
  else{
      return "";
  }
}
function getName(){
  var params = window.location.search.substr(1).split("&");
  
  if(params){
      for(let i = 0; i < params.length; i++){
          var key = params[i].split("=")[0];
          var value = params[i].split("=")[1];
          
          if(key === "name"){
              return decodeURIComponent(value);
          }
      }
  }
  
  else{
      return "";
  }
}
// BUTTON LISTENER ============================================================
connectButton.addEventListener('click', () => {
  joinRoom(roomInput.value,nameInput.value)
})
sendmessage.addEventListener('click', () => {
  sndmsg(chatInput.value);
  chatInput.value = ''

})
function sndmsg(event) {
 try {
  var date = new Date().toLocaleTimeString();
  socket.emit('message', {name: getRoom(),message:event,senderId: localPeerId,roomId:getRoom(),sender:getName(),date:date});
  addstudent(getName(),event,date,"send");
  var fileInput = document.getElementById('fileInput');
  var file = fileInput.files[0];
  if(file!=undefined){
    
  var reader = new FileReader();
  
  reader.onload = function(e) {
    var imageBase64 = e.target.result;
    var date = new Date().toLocaleTimeString();
  
    // إرسال الصورة عبر socket.emit
    socket.emit('image', {name: getRoom(),message:imageBase64,senderId: localPeerId,roomId:getRoom(),sender:getName(),date:date});
    var img = new Image();
    img.src = imageBase64;
    img.style.width = '300px';
    img.style.height = '200px';
    //$("#chats").append(img);
    var element = document.getElementById('chats');
      element.append(img);
      element.scrollTop = element.scrollHeight;
  };
  reader.readAsDataURL(file);
  fileInput.value = ''; 
}
 } catch (error) {
  alert(error);
 }
}

socket.on('image', async (event) => {
  var img = new Image();
  img.src = event.message;
  img.style.width = '300px';
  img.style.height = '200px';
  // $("#chats").append(img);
  var element = document.getElementById('chats');
      element.append(newlyCreatedNode);
      element.scrollTop = element.scrollHeight;
})
// SOCKET EVENT CALLBACKS =====================================================

/**
 * Mensaje room_created recibido al unirse a una sala vacía
 */
socket.on('room_created', async (event) => {
  localPeerId = event.peerId
  localStorage.setItem('token_admin', "true");
  console.log(`Current peer ID: ${localPeerId}`)
  console.log(`Socket event callback: room_created with by peer ${localPeerId}, created room ${event.roomId}`)

  await setLocalStream(mediaConstraints)
})

/**
 * Mensaje room_joined al unirse a una sala con pares conectados. Comienza la llamada enviando
 * start_call
 */
socket.on('room_joined', async (event) => {
  if(localStorage.getItem('token_admin')!="true"){
    $("#students").hide();
  }
  localPeerId = event.peerId
  console.log(`Current peer ID: ${localPeerId}`)
  console.log(`Socket event callback: room_joined by peer ${localPeerId}, joined room ${event.roomId}`)

  await setLocalStream(mediaConstraints)
  console.log(`Emit start_call from peer ${localPeerId}`)
  socket.emit('start_call', {
    roomId: event.roomId,
    name:nameInput.value,
    senderId: localPeerId
  })
})

/**
 * Mensaje start_call recibido y crea el objeto RTCPeerConnection para enviar la oferta al otro par
 */
socket.on('start_call', async (event) => {  
  const remotePeerId = event.senderId;
  console.log(`Socket event callback: start_call. RECEIVED from ${remotePeerId}`)
  var name = event.name;
  peerConnections[remotePeerId] = new RTCPeerConnection(iceServers)
  addLocalTracks(peerConnections[remotePeerId])
  peerConnections[remotePeerId].ontrack = (event) => setRemoteStream(event, remotePeerId,name)
  peerConnections[remotePeerId].oniceconnectionstatechange = (event) => checkPeerDisconnect(event, remotePeerId);
  peerConnections[remotePeerId].onicecandidate = (event) => sendIceCandidate(event, remotePeerId)
  await createOffer(peerConnections[remotePeerId], remotePeerId)
})
socket.on('message', async (event) => {  
  var name = event.message;
  addstudent(event.sender,name,event.date);
})
/**
 * Mensaje webrtc_offer recibido con la oferta y envía la respuesta al otro par
 */
socket.on('webrtc_offer', async (event) => {
  var name = event.name;
  console.log(`Socket event callback: webrtc_offer. RECEIVED from ${event.senderId}`)
  const remotePeerId = event.senderId;

  peerConnections[remotePeerId] = new RTCPeerConnection(iceServers)
  console.log(new RTCSessionDescription(event.sdp))
  peerConnections[remotePeerId].setRemoteDescription(new RTCSessionDescription(event.sdp))
  console.log(`Remote description set on peer ${localPeerId} after offer received`)
  addLocalTracks(peerConnections[remotePeerId])

  peerConnections[remotePeerId].ontrack = (event) => setRemoteStream(event, remotePeerId,name)
  peerConnections[remotePeerId].oniceconnectionstatechange = (event) => checkPeerDisconnect(event, remotePeerId);
  peerConnections[remotePeerId].onicecandidate = (event) => sendIceCandidate(event, remotePeerId)
  await createAnswer(peerConnections[remotePeerId], remotePeerId)
})

/**
 * Mensaje webrtc_answer recibido y termina el proceso offer/answer.
 */
socket.on('webrtc_answer', async (event) => {
  console.log(`Socket event callback: webrtc_answer. RECEIVED from ${event.senderId}`)

  console.log(`Remote description set on peer ${localPeerId} after answer received`)
  peerConnections[event.senderId].setRemoteDescription(new RTCSessionDescription(event.sdp))
  //addLocalTracks(peerConnections[event.senderId])
  console.log(new RTCSessionDescription(event.sdp))
})

/**
 * Mensaje webrtc_ice_candidate. Candidato ICE recibido de otro par
 */
socket.on('webrtc_ice_candidate', (event) => {
  const senderPeerId = event.senderId;
  console.log(`Socket event callback: webrtc_ice_candidate. RECEIVED from ${senderPeerId}`)

  // ICE candidate configuration.
  var candidate = new RTCIceCandidate({
    sdpMLineIndex: event.label,
    candidate: event.candidate,
    name:event.name,
  })
  peerConnections[senderPeerId].addIceCandidate(candidate)
})

// FUNCTIONS ==================================================================

/**
 * Envía mensaje join al servidor. Servidor responderá con room_joined o room_created
 */
function joinRoom(room,name) {
  if (room === '') {
    alert('Please type a room ID')
  } else {
    roomId = room
    socket.emit('join', {room: room, peerUUID: localPeerId,name,name})
    showVideoConference()
  }
}

/**
 * Cambia el layout para mostrar vídeos al introducir el número de la sala
 */
function showVideoConference() {
  roomSelectionContainer.style = 'display: none'
  videoChatContainer.style = 'display: block'
}

/**
 * Recoge el stream local multimedia usando API getUserMedia
 */
async function setLocalStream(mediaConstraints) {
  console.log('Local stream set')
  let stream
  try {
    stream = await navigator.mediaDevices.getDisplayMedia(mediaConstraints)
  } catch (error) {
    alert('Could not get user media'+ error)
  }

  localStream = stream
  const videoREMOTO = document.createElement('video');
  videoREMOTO.srcObject = stream; // تأكد من أن event.streams[0] معرفة بشكل صحيح
  videoREMOTO.id = 'remotevideo_'; // تأكد من أن remotePeerId معرفة بشكل صحيح
  videoREMOTO.setAttribute('autoplay', '');
  videoREMOTO.style.width = "200px"; // تحديد عرض الفيديو
  videoREMOTO.style.height = "150px"; // تحديد ارتفاع الفيديو
  
  // إنشاء عنصر النص لاسم الطالب
  var studentName = document.createElement('p');
  studentName.textContent = nameInput.value; // استبدل 'اسم الطالب' بالاسم الفعلي للطالب
  studentName.style.marginLeft = "10px"; // تحديد المسافة بين الفيديو والنص
  
  // إنشاء عنصر div لتحديد الصف
  var rowContainer = document.createElement('div');
  rowContainer.style.display = "flex"; // تحديد ترتيب العناصر بشكل أفقي
  rowContainer.style.alignItems = "center"; // تحديد محاذاة العناصر بالوسط
  rowContainer.append(videoREMOTO, studentName); // إضافة الفيديو واسم الطالب إلى الصف
  
  videoChatContainer.append(rowContainer);
}

/**
 * Añade un stream multimedia al objeto RTCPeerConnection recibido
 */
function addLocalTracks(rtcPeerConnection) {
  localStream.getTracks().forEach((track) => {
    rtcPeerConnection.addTrack(track, localStream)
  })
  console.log("Local tracks added")
}

/**
 * Crea la oferta con la información SDP y la envía con el mensaje webrtc_offer
 */
async function createOffer(rtcPeerConnection, remotePeerId) {
  let sessionDescription
  try {
    sessionDescription = await rtcPeerConnection.createOffer(offerOptions)
    rtcPeerConnection.setLocalDescription(sessionDescription)
  } catch (error) {
    console.error(error)
  }

  console.log(`Sending offer from peer ${localPeerId} to peer ${remotePeerId}`)
  socket.emit('webrtc_offer', {
    type: 'webrtc_offer',
    sdp: sessionDescription,
    roomId: roomId,
    name:nameInput.value,
    senderId: localPeerId,
    receiverId: remotePeerId
  })
}

/**
 * Crea la respuesta con la información SDP y la envía con el mensaje webrtc_answer
 */
async function createAnswer(rtcPeerConnection, remotePeerId) {
  let sessionDescription
  try {
    sessionDescription = await rtcPeerConnection.createAnswer(offerOptions)
    rtcPeerConnection.setLocalDescription(sessionDescription)
  } catch (error) {
    console.error(error)
  }

  console.log(`Sending answer from peer ${localPeerId} to peer ${remotePeerId}`)
  socket.emit('webrtc_answer', {
    type: 'webrtc_answer',
    sdp: sessionDescription,
    roomId: roomId,
    senderId: localPeerId,
    receiverId: remotePeerId
  })
}

/**
 * Callback cuando se recibe el stream multimedia del par remoto
 */
function setRemoteStream(event, remotePeerId, name) {
  console.log('Remote stream set');
  if (event.track.kind === "video") {
    alert("الفيديو");
    const videoREMOTO = document.createElement('video');
    videoREMOTO.srcObject = event.streams[0]; // تأكد من أن event.streams[0] معرفة بشكل صحيح
    videoREMOTO.id = 'remotevideo_' + remotePeerId; // تأكد من أن remotePeerId معرفة بشكل صحيح
    videoREMOTO.setAttribute('autoplay', '');
    videoREMOTO.style.width = "200px"; // تحديد عرض الفيديو
    videoREMOTO.style.height = "150px"; // تحديد ارتفاع الفيديو
    
    // إنشاء عنصر النص لاسم الطالب
    var studentName = document.createElement('p');
    studentName.textContent = name; // استبدل 'اسم الطالب' بالاسم الفعلي للطالب
    studentName.style.marginLeft = "10px"; // تحديد المسافة بين الفيديو والنص
    
    // إنشاء عنصر div لتحديد الصف
    var rowContainer = document.createElement('div');
    rowContainer.style.display = "flex"; // تحديد ترتيب العناصر بشكل أفقي
    rowContainer.style.alignItems = "center"; // تحديد محاذاة العناصر بالوسط
    rowContainer.append(videoREMOTO, studentName); // إضافة الفيديو واسم الطالب إلى الصف
    
    if (localVideoComponent.srcObject) {
      videoChatContainer.append(rowContainer); // إضافة الصف إلى واجهة المستخدم
    } else {
      localVideoComponent.srcObject = event.streams[0];
    }
  }
}


/**
 * Envía el candidato ICE recibido del cuando se recibe el evento onicecandidate del objeto RTCPeerConnection
 */
function sendIceCandidate(event, remotePeerId) {
  if (event.candidate) {
    console.log(`Sending ICE Candidate from peer ${localPeerId} to peer ${remotePeerId}`)
    socket.emit('webrtc_ice_candidate', {
      senderId: localPeerId,
      receiverId: remotePeerId,
      roomId: roomId,
      name:nameInput.value,
      label: event.candidate.sdpMLineIndex,
      candidate: event.candidate.candidate,
    })
  }
}

/**
 * Comprueba si el par se ha desconectado cuando recibe el evento onicestatechange del objeto RTCPeerConnection
 */
function checkPeerDisconnect(event, remotePeerId) {
  var state = peerConnections[remotePeerId].iceConnectionState;
  console.log(`connection with peer ${remotePeerId}: ${state}`);
  if (state === "failed" || state === "closed" || state === "disconnected") {
    //Se eliminar el elemento de vídeo del DOM si se ha desconectado el par
    console.log(`Peer ${remotePeerId} has disconnected`);
    const videoDisconnected = document.getElementById('remotevideo_' + remotePeerId)
    videoDisconnected.remove()
  }
}
function addstudent(name,message,date,type){
  new Promise(function(resolve, reject){
      var newNode = document.createElement('div');
      
      return resolve(newNode);
  }).then(function(newlyCreatedNode){
      if(type=="send"){
        name = "أنت";
        newlyCreatedNode.innerHTML = ' <div class="panel-body msg_container_base" style="border-radius: 0 0 0 0;display: block;margin-right:20% !important;margin-top:1px !important;" dir="ltr"><div dir="rtl">\
              <div class="messages msg_receive" style="background-color:#e7ffdb;">\
              <p style="color:#d22d2d">'+name+'</p>\
                  <p style="color:#313c3d">'+message+'</p>\
                  <time style="color:#887b7b"> '+date+'• </time>\
              </div>\
          </div></div>';
      }else{
        newlyCreatedNode.innerHTML = ' <div class="panel-body msg_container_base" style="display: block;margin-left:20% !important;margin-top:1px !important;" dir="ltr"><div dir="rtl">\
              <div class="messages msg_receive">\
              <p style="color:pink">'+name+'</p>\
                  <p>'+message+'</p>\
                  <time> '+date+'• </time>\
              </div>\
          </div></div>';
      }
      
     // document.getElementById('chats').appendChild(newlyCreatedNode);
      var element = document.getElementById('chats');
      element.appendChild(newlyCreatedNode);
      element.scrollTop = element.scrollHeight;
      
      //open the chat just in case it is closed

      fixChatScrollBarToBottom();
  });
}
