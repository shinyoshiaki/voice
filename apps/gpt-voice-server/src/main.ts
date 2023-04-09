import { RTCPeerConnection } from "werift";
import { Server } from "ws";
import { SessionFactory } from "../../../libs/rtp2text/src";
import { Configuration, OpenAIApi } from "openai";
import { config } from "./config";
import { VoicevoxClient } from "../../../libs/voicevox-client/src";
import { Audio2Rtp } from "../../../libs/audio2rtp/src";
import { mkdir } from "fs/promises";

const server = new Server({ port: 8888 });
const conf = new Configuration({
  apiKey: config.openai,
});
const client = new VoicevoxClient();

console.log("start");

const factory = new SessionFactory({ modelPath: __dirname + "/vosk-model" });

const main = async () => {
  await mkdir("./log", { recursive: true }).catch((e) => e);

  server.on("connection", async (socket) => {
    console.log("new session");

    const session = await factory.create();
    const openai = new OpenAIApi(conf);
    const audio = await Audio2Rtp.Create();

    const pc = new RTCPeerConnection();
    const transceiver = pc.addTransceiver("audio", { direction: "sendrecv" });

    audio.onSpeakChanged.subscribe(() => {
      console.log("ai", audio.speaking ? "speaking" : "done");
    });

    session.onText.subscribe(async (res) => {
      try {
        if (audio.speaking) {
          return;
        }

        if (res.result) {
          console.log("me", res.result);
          if (res.result.length === 1) {
            return;
          }
          if (["えーっと"].includes(res.result)) {
            return;
          }

          const completion = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: res.result }],
          });
          const prompt = completion.data.choices[0].message?.content;
          if (!prompt) return;

          console.log("ai", prompt);

          for (const word of prompt.split("、").filter((v) => v)) {
            const wav = await client.speak(word);
            audio.inputWav(wav, { metadata: word }).catch((e) => e);
          }
        }

        if (res.partial) {
          console.log("recognizing", res.partial);
        }
      } catch (error) {
        console.error(error);
      }
    });

    audio.onRtp.subscribe((rtp) => {
      transceiver.sender.sendRtp(rtp);
    });

    transceiver.onTrack.subscribe((track) => {
      track.onReceiveRtp.subscribe((rtp) => {
        session.inputRtp(rtp);
      });
    });

    await pc.setLocalDescription(await pc.createOffer());
    const sdp = JSON.stringify(pc.localDescription);
    socket.send(sdp);

    socket.on("message", (data: any) => {
      pc.setRemoteDescription(JSON.parse(data));
    });
  });
};
main();
