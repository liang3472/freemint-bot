
import Web3 from 'web3';
import axios from 'axios';
import chalk from 'chalk';
import { DiscordRequest } from './utils.js';
const web3 = new Web3(`wss://eth-mainnet.alchemyapi.io/v2/${process.env.ALCHEMY_AK}`);
const contractMap = new Map();
const queryMap = new Map();
const MIN = 3;
const NOTIFY_DEALY = MIN * 60 * 1000;
const QUERY_LIMIT = 30;

class WatchDog {
  constructor() {
    this.instance = axios.create({
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.61 Safari/537.36',
          'X-API-KEY': process.env.OS_AK
      }
    });
    this.queryCount = 0;
  }

  init(channelId) {
    this.channelId = channelId;
  }

  start() {
    this.sendMsg('脚本启动🚀....');
    this.subscribe();
    this.timer = setInterval(() => {
      if (contractMap.size > 0) {
        // 取前3进行展示，其余删除
        Array.from(contractMap.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 1)
          .forEach(e => this.notify(e));

        console.log(chalk.yellow('清理合约缓存...'));
        contractMap.clear();
      }
    }, NOTIFY_DEALY);
  }

  getState() {
    return `
      🤖️机器人状态
      合约缓存情况: ${contractMap.size} 条
      abi缓存情况: ${queryMap.size} 条
      abi请求数: ${this.queryCount} 条
      `
  }

  stop() {
    this.sendMsg('脚本关闭❌....');
    this.subscription && this.subscription.unsubscribe(function (error, success) {
      if (success) {
        console.log('Successfully unsubscribed!');
      }
    });
    clearInterval(this.timer);
  }

  async info() {
    const top = Array.from((contractMap?.values() || []))
      .sort((a, b) => b.count - a.count)
      .slice(0, 1)?.[0];
    if (top) {
      this.sendMsg(this.getState() + await this.getMessage(top));
    } else {
      this.sendMsg(this.getState());
    }
  }

  async sendMsg(msg) {
    const endpoint = `/channels/${this.channelId}/messages`;
    await DiscordRequest(endpoint, {
      method: 'POST', body: {
        content: '',
        tts: false,
        embeds: [{
          title: '图狗播报',
          description: msg
        }]
      }
    });
  }

  /**
   * 根据地址查询合约abi
   * @param {*} address 
   * @returns abi[]
   */
  async getAbi(address) {
    console.log('查询合约:', address);
    const old = queryMap.get(address);
    if (old) {
      console.log(chalk.yellow('使用缓存合约'));
      return old
    }
    const that = this;
    that.queryCount += 1;
    console.log(chalk.green('发送查询合约请求'));
    return await this.instance.get(`https://api.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=MT4K2JBC4VRH5JHFADE81PAN7RJCIE8HMM`).then(data => {
      try {
        const contractABI = JSON.parse(data.data.result);
        if (queryMap.size >= 1000) {
          queryMap.clear();
          console.log(chalk.yellow('清理abi缓存...'));
        }
        queryMap.set(address, contractABI);
        return contractABI;
      } catch (e) {
        console.log(chalk.red('查询abi失败', e));
        queryMap.set(address, null);
        return null;
      }
    }).catch(err => {
      that.sendMsg('查询abi接口异常');
      console.log(chalk.red('查询abi接口异常', err));
      return null;
    }).finally(() => {
      that.queryCount -= 1;
    });
  }

  async getOpenSeaInfoByContract(address) {
    const that = this;
    console.log('OS上的信息:', address);
    return await this.instance.get(`https://api.opensea.io/api/v1/asset_contract/${address}`).then(data => {
      return data.data || {};
    }).catch(err=>{
      that.sendMsg('查询opensea接口异常');
      return {};
    });
  }

  /**
   * 是否达到最大请求数
   */
  isFullQueryCount() {
    return this.queryCount >= QUERY_LIMIT;
  }

  /**
   * 过滤出abi中的mint方法
   * @param {*} address 
   * @returns string[]
   */
  async filterMintFunc(address) {
    return await this.getAbi(address).then(data => {
      if (!data) return [];
      var contract = new web3.eth.Contract(data, address);
      const { _jsonInterface } = contract;
      const mintFuncs = _jsonInterface.filter(func => {
        return /mint/.test((func.name || '').toLowerCase());
      });
      return mintFuncs;
    });
  }

  /**
   * methodId是否是调用的mint函数
   * @param {*} abis 
   * @param {*} methodId 
   * @returns bool
   */
  isCallMint(abis, methodId) {
    return abis.map(e => e.signature).includes(methodId);
  }

  /**
   * 根据methodId返回methodName
   * @param {*} abis 
   * @param {*} methodId 
   * @returns string
   */
  getMethodNameById(abis, methodId) {
    return abis.find(e => e.signature === methodId)?.name;
  }

  /**
   * 该交易是否免费
   * @param {*} txData 
   * @returns bool
   */
  isFree(txData) {
    const { value, gasPrice, input } = txData;
    const methodId = input.slice(0, 10);
    return +value === 0 && +gasPrice > 0 && methodId.length === 10;
  }

  /**
   * 获取methodId
   * @param {*} txData 
   * @returns string
   */
  getMethodId(txData) {
    const { input } = txData;
    return input.slice(0, 10);
  }

  /**
   * 展示调用函数名
   * @param {*} name 
   */
  showFuncName(name) {
    name && console.log(`调用合约函数 ${name}`);
  }

  async getMessage(data) {
    const osInfo = await this.getOpenSeaInfoByContract(data.to);
    console.log(osInfo);
    return `freemint项目${MIN}min继续发生mint: 
    名称: ${osInfo?.collection?.name || '未知项目'}
    官网: ${osInfo?.collection?.external_link || '无官网信息'}
    合约address: ${data.to}
    mint函数: Function ${data.methodName} 调用次数 ${data.count} 次
    合约: https://etherscan.io/address/${data.to}#code
    OpenSea: ${osInfo?.collection?.slug ? `https://opensea.io/collection/${osInfo?.collection?.slug}` : '未知'}
    税点: ${osInfo?.seller_fee_basis_points ? `${osInfo.seller_fee_basis_points / 100}%` : '未知'}
    `;
  }

  async notify(data) {
    this.sendMsg(await this.getMessage(data));
  }

  subscribe() {
    const that = this;
    this.subscription = web3.eth.subscribe('newBlockHeaders', async function (error, blockHeader) {
      if (!error) {
        const { number } = blockHeader;
        const blockData = await web3.eth.getBlock(number);
        if (blockData) {
          const { transactions } = blockData;
          // 达到了最大请求数,需要等待请求数降下来
          if (that.isFullQueryCount()) {
            console.log('请求数到达限制，跳过');
            return;
          }
          // 过滤异常交易
          if (!transactions || transactions.length === 0) return;
          for (let txHash of transactions) {
            const txData = await web3.eth.getTransaction(txHash);
            // 过滤非免费和无数据交易
            if (!txData) continue;
            if (!that.isFree(txData)) continue;

            const { to } = txData;
            const methodId = that.getMethodId(txData);
            // 获取缓存数据
            const old = contractMap.get(to);
            let methodName = '';
            if (old) {
              // 过滤掉不是mint的事件
              if (!that.isCallMint(old.abis, methodId)) continue;
              contractMap.set(to, {
                count: old.count + 1,
                abis: old.abis,
                methodName: old.methodName,
                to: old.to,
              });
              methodName = that.getMethodNameById(old.abis, methodId);
            } else {
              const abis = await that.filterMintFunc(to);
              // 过滤掉无abi的情况
              if (!abis || !abis.length) continue;
              // 过滤掉不是mint的事件
              if (!that.isCallMint(abis, methodId)) continue;

              methodName = that.getMethodNameById(abis, methodId);
              // 存入缓存数据
              contractMap.set(to, {
                count: 1,
                abis,
                methodName,
                to,
              });
            }
            that.showFuncName(methodName);
            console.log('疑似白嫖：', txData);
          }
        }
        return;
      }
      
      that.sendMsg('脚本异常....', error);
      console.error(error);
    });
  }
}

export default new WatchDog();