import { ChatFunctions } from "../../../../libs/gpt-voice-rpc/src";
import { assistantUsecase, userUsecase } from "../bootstrap";

import { SessionService } from "../infrastructure/sessionService";
import { Logger } from "../logger";

const logger = new Logger("apps/gpt-voice-server/src/controller/rpc.ts");

export function rpcController(service: SessionService) {
  const { unSubscribe } = service.connection.onMessage.subscribe(async (s) => {
    const { type, payload } = JSON.parse(s as string) as ChatFunctions;

    logger.info(`rpcController: ${type} ${JSON.stringify(payload)}`);

    switch (type) {
      case "clearHistory":
        {
          assistantUsecase.clearHistory(service)();
        }
        break;
      case "cancelQuestion":
        {
          await assistantUsecase.cancelQuestion(service)();
        }
        break;
      case "changeModel":
        {
          await assistantUsecase.changeModel(service)(payload.model);
        }
        break;
      case "setRecognizePaused":
        {
          userUsecase.setRecognizePaused(service)(payload.paused);
        }
        break;
    }
  });
  return unSubscribe;
}
