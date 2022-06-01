# freemint-bot
## 背景
这是一个DC机器人项目,用于监控链上产生free mint的项目, 目前我自己部署在 https://glitch.com/ 作为自己的机器人使用.

![image](https://user-images.githubusercontent.com/5353946/171440775-ff354ad1-92bf-41f3-823f-3b9bea537dbf.png)

## 使用
核心代码在 `watchDog.js` 里, 可以直接调用start方法启动, `app.js` 里是DC机器人的触发指令, 目前支持的指令有

1、`start` 启动脚本监控

![image](https://user-images.githubusercontent.com/5353946/171442161-4b7f3eed-fd62-4786-890c-a3fb10d973c2.png)


2、`stop` 停止脚本监控

![image](https://user-images.githubusercontent.com/5353946/171442192-4e00a15a-ec79-4a02-95e4-c036e15d2827.png)


3、`test` 检测运行状态

![image](https://user-images.githubusercontent.com/5353946/171442264-baefe61c-0954-4236-b307-7ce065826b91.png)
