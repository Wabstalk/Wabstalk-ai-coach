let peerConnection = null;
let dataChannel = null;
let localStream = null;

let transcript = [];
let startTime = null;
let timerInterval = null;

const startButton = document.getElementById("startButton");
const finishButton = document.getElementById("finishButton");
const againButton = document.getElementById("againButton");

const welcome = document.getElementById("welcome");
const session = document.getElementById("session");
const report = document.getElementById("report");

const status = document.getElementById("status");
const orb = document.getElementById("orb");
const timer = document.getElementById("timer");
const coachHint = document.getElementById("coachHint");
const transcriptBox = document.getElementById("transcript");

const scores = document.getElementById("scores");
const strengths = document.getElementById("strengths");
const priorities = document.getElementById("priorities");
const nextPractice = document.getElementById("nextPractice");
const errorBox = document.getElementById("error");


function setStatus(message) {
  status.textContent = message;
}


function escapeHTML(text) {
  return text.replace(/[&<>"']/g, function (character) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character];
  });
}


function addTranscript(role, text) {

  if (!text || !text.trim()) {
    return;
  }

  const cleanText = text.trim();

  transcript.push({
    role: role,
    text: cleanText
  });

  const line = document.createElement("div");

  line.innerHTML =
    "<strong>" +
    (role === "user" ? "You" : "Coach") +
    ":</strong> " +
    escapeHTML(cleanText);

  transcriptBox.appendChild(line);

  transcriptBox.scrollTop =
    transcriptBox.scrollHeight;
}


function updateTimer() {

  if (!startTime) {
    return;
  }

  const seconds =
    Math.floor((Date.now() - startTime) / 1000);

  const minutes =
    Math.floor(seconds / 60);

  const remainingSeconds =
    seconds % 60;

  timer.textContent =
    String(minutes).padStart(2, "0") +
    ":" +
    String(remainingSeconds).padStart(2, "0");
}


function handleRealtimeEvent(event) {

  console.log("Realtime event:", event);

  /*
    Student transcript
  */

  if (
    event.type ===
    "conversation.item.input_audio_transcription.completed"
  ) {

    addTranscript(
      "user",
      event.transcript || ""
    );
  }


  /*
    AI transcript
  */

  if (
    event.type ===
    "response.audio_transcript.done"
  ) {

    addTranscript(
      "coach",
      event.transcript || ""
    );
  }


  /*
    Response completed
  */

  if (event.type === "response.done") {

    coachHint.textContent =
      "Your turn — speak naturally.";
  }


  /*
    Errors
  */

  if (event.type === "error") {

    console.error(event);

    coachHint.textContent =
      event.error?.message ||
      "Something went wrong.";
  }
}


async function startLesson() {

  try {

    errorBox.textContent = "";

    welcome.classList.add("hidden");
    report.classList.add("hidden");
    session.classList.remove("hidden");

    transcript = [];
    transcriptBox.innerHTML = "";

    setStatus("Connecting…");

    coachHint.textContent =
      "Connecting you to your WabsTalk AI Coach…";


    /*
      Ask the browser for microphone access.
    */

    localStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });


    /*
      Create WebRTC connection.
    */

    peerConnection =
      new RTCPeerConnection();


    /*
      Receive AI audio.
    */

    peerConnection.ontrack =
      function (event) {

        const audio =
          document.createElement("audio");

        audio.autoplay = true;

        audio.srcObject =
          event.streams[0];

        document.body.appendChild(audio);
      };


    /*
      Send microphone audio.
    */

    localStream
      .getTracks()
      .forEach(function (track) {

        peerConnection.addTrack(
          track,
          localStream
        );

      });


    /*
      Create realtime data channel.
    */

    dataChannel =
      peerConnection.createDataChannel(
        "oai-events"
      );


    dataChannel.onopen =
      function () {

        setStatus("LIVE");

        orb.classList.add("live");

        coachHint.textContent =
          "Your coach is listening…";


        /*
          Tell the AI to begin the lesson.
        */

        dataChannel.send(
          JSON.stringify({
            type: "response.create"
          })
        );
      };


    dataChannel.onmessage =
      function (message) {

        try {

          const event =
            JSON.parse(message.data);

          handleRealtimeEvent(event);

        } catch (error) {

          console.error(
            "Could not read realtime event:",
            error
          );

        }
      };


    peerConnection.onconnectionstatechange =
      function () {

        console.log(
          "Connection:",
          peerConnection.connectionState
        );

        if (
          peerConnection.connectionState ===
          "connected"
        ) {

          setStatus("LIVE");

        }

        if (
          peerConnection.connectionState ===
          "failed"
        ) {

          setStatus("Connection failed");

          coachHint.textContent =
            "We couldn't connect to the AI coach.";

        }

      };


    /*
      Create WebRTC offer.
    */

    const offer =
      await peerConnection.createOffer();


    await peerConnection.setLocalDescription(
      offer
    );


    /*
      Send SDP to our secure server.
      The OpenAI API key NEVER goes into
      this browser code.
    */

    const response =
      await fetch(
        "/api/realtime-call",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            sdp: offer.sdp
          })
        }
      );


    if (!response.ok) {

      const message =
        await response.text();

      throw new Error(message);
    }


    /*
      Receive OpenAI's SDP answer.
    */

    const answer =
      await response.text();


    await peerConnection.setRemoteDescription({
      type: "answer",
      sdp: answer
    });


    /*
      Start lesson timer.
    */

    startTime = Date.now();

    timerInterval =
      setInterval(
        updateTimer,
        500
      );


  } catch (error) {

    console.error(error);

    session.classList.add("hidden");

    welcome.classList.remove("hidden");

    errorBox.textContent =
      error.message ||
      "Unable to start the lesson.";

  }

}


async function finishLesson() {

  try {

    setStatus("Evaluating…");

    coachHint.textContent =
      "Building your WabsTalk communication report…";

    orb.classList.remove("live");


    clearInterval(timerInterval);


    /*
      Close microphone.
    */

    if (localStream) {

      localStream
        .getTracks()
        .forEach(function (track) {

          track.stop();

        });

    }


    /*
      Close realtime connection.
    */

    if (dataChannel) {

      dataChannel.close();

    }

    if (peerConnection) {

      peerConnection.close();

    }


    session.classList.add("hidden");

    report.classList.remove("hidden");


    /*
      Convert transcript to plain text.
    */

    const transcriptText =
      transcript
        .map(function (item) {

          return (
            item.role +
            ": " +
            item.text
          );

        })
        .join("\n");


    if (!transcriptText.trim()) {

      errorBox.textContent =
        "No conversation transcript was captured. Please try again.";

      return;

    }


    /*
      Ask our server to evaluate the lesson.
    */

    const response =
      await fetch(
        "/api/evaluate",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            transcript:
              transcriptText
          })
        }
      );


    const data =
      await response.json();


    if (!response.ok) {

      throw new Error(
        data.error ||
        "Evaluation failed."
      );

    }


    displayReport(data);


  } catch (error) {

    console.error(error);

    errorBox.textContent =
      error.message ||
      "Unable to generate your report.";

  }

}


function displayReport(data) {

  const categories = [
    ["Fluency", data.fluency],
    ["Grammar", data.grammar],
    ["Vocabulary", data.vocabulary],
    [
      "Pronunciation",
      data.pronunciation_intelligibility ??
      "—"
    ],
    ["Conversation", data.conversation],
    ["Communication", data.communication],
    ["Overall", data.overall]
  ];


  scores.innerHTML =
    categories
      .map(function (item) {

        return `
          <div class="score">
            <span>${item[0]}</span>
            <b>${item[1]}</b>
          </div>
        `;

      })
      .join("");


  fillList(
    strengths,
    data.strengths
  );

  fillList(
    priorities,
    data.priorities
  );

  fillList(
    nextPractice,
    data.next_practice
  );

}


function fillList(element, items) {

  element.innerHTML =
    (items || [])
      .map(function (item) {

        return (
          "<li>" +
          escapeHTML(item) +
          "</li>"
        );

      })
      .join("");

}


startButton.addEventListener(
  "click",
  startLesson
);


finishButton.addEventListener(
  "click",
  finishLesson
);


againButton.addEventListener(
  "click",
  function () {

    report.classList.add("hidden");

    welcome.classList.remove("hidden");

    errorBox.textContent = "";

  }
);