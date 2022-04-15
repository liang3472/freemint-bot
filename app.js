import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
} from 'discord-interactions';
import { VerifyDiscordRequest, getRandomEmoji } from './utils.js';
import {
  START_COMMAND,
  STOP_COMMAND,
  INFO_COMMAND,
  HasGuildCommands,
} from './commands.js';
import WatchDog from './watchDog.js';

const app = express();
app.use(express.json({ verify: VerifyDiscordRequest(process.env.PUBLIC_KEY) }));

app.post('/interactions', async function (req, res) {
  const { type, id, data, channel_id } = req.body;

  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;
    // 初始化
    WatchDog.init(channel_id);
    
    if (name === 'start') {
      WatchDog.start(channel_id);
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `你踢了一脚🤖️, 它动了${getRandomEmoji()}`,
        },
      });
    } else if (name === 'stop') {
      WatchDog.stop(channel_id);
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `你踢了一脚🤖️, 它不动了${getRandomEmoji()}`,
        },
      });
    } else if (name === 'test') {
      WatchDog.info(channel_id);
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: `你踢了一脚🤖️, 看它咋样了${getRandomEmoji()}`,
        },
      });
    }
  }
});

app.listen(3000, () => {
  console.log('Listening on port 3000');
  HasGuildCommands(process.env.APP_ID, process.env.GUILD_ID, [
    START_COMMAND,
    STOP_COMMAND,
    INFO_COMMAND,
  ]);
});