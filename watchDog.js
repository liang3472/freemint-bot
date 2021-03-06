
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
    this.sendMsg('èæ¬å¯å¨ð....');
    this.subscribe();
    this.timer = setInterval(() => {
      if (contractMap.size > 0) {
        // åå3è¿è¡å±ç¤ºï¼å¶ä½å é¤
        Array.from(contractMap.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 1)
          .forEach(e => this.notify(e));

        console.log(chalk.yellow('æ¸çåçº¦ç¼å­...'));
        contractMap.clear();
      }
    }, NOTIFY_DEALY);
  }

  getState() {
    return `
      ð¤ï¸æºå¨äººç¶æ
      åçº¦ç¼å­æåµ: ${contractMap.size} æ¡
      abiç¼å­æåµ: ${queryMap.size} æ¡
      abiè¯·æ±æ°: ${this.queryCount} æ¡
      `
  }

  stop() {
    this.sendMsg('èæ¬å³é­â....');
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
          title: 'å¾çæ­æ¥',
          description: msg
        }]
      }
    });
  }

  /**
   * æ ¹æ®å°åæ¥è¯¢åçº¦abi
   * @param {*} address 
   * @returns abi[]
   */
  async getAbi(address) {
    console.log('æ¥è¯¢åçº¦:', address);
    const old = queryMap.get(address);
    if (old) {
      console.log(chalk.yellow('ä½¿ç¨ç¼å­åçº¦'));
      return old
    }
    const that = this;
    that.queryCount += 1;
    console.log(chalk.green('åéæ¥è¯¢åçº¦è¯·æ±'));
    return await this.instance.get(`https://api.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=MT4K2JBC4VRH5JHFADE81PAN7RJCIE8HMM`).then(data => {
      try {
        const contractABI = JSON.parse(data.data.result);
        if (queryMap.size >= 1000) {
          queryMap.clear();
          console.log(chalk.yellow('æ¸çabiç¼å­...'));
        }
        queryMap.set(address, contractABI);
        return contractABI;
      } catch (e) {
        console.log(chalk.red('æ¥è¯¢abiå¤±è´¥', e));
        queryMap.set(address, null);
        return null;
      }
    }).catch(err => {
      that.sendMsg('æ¥è¯¢abiæ¥å£å¼å¸¸');
      console.log(chalk.red('æ¥è¯¢abiæ¥å£å¼å¸¸', err));
      return null;
    }).finally(() => {
      that.queryCount -= 1;
    });
  }

  async getOpenSeaInfoByContract(address) {
    const that = this;
    console.log('OSä¸çä¿¡æ¯:', address);
    return await this.instance.get(`https://api.opensea.io/api/v1/asset_contract/${address}`).then(data => {
      return data.data || {};
    }).catch(err=>{
      that.sendMsg('æ¥è¯¢openseaæ¥å£å¼å¸¸');
      return {};
    });
  }

  /**
   * æ¯å¦è¾¾å°æå¤§è¯·æ±æ°
   */
  isFullQueryCount() {
    return this.queryCount >= QUERY_LIMIT;
  }

  /**
   * è¿æ»¤åºabiä¸­çmintæ¹æ³
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
   * methodIdæ¯å¦æ¯è°ç¨çmintå½æ°
   * @param {*} abis 
   * @param {*} methodId 
   * @returns bool
   */
  isCallMint(abis, methodId) {
    return abis.map(e => e.signature).includes(methodId);
  }

  /**
   * æ ¹æ®methodIdè¿åmethodName
   * @param {*} abis 
   * @param {*} methodId 
   * @returns string
   */
  getMethodNameById(abis, methodId) {
    return abis.find(e => e.signature === methodId)?.name;
  }

  /**
   * è¯¥äº¤ææ¯å¦åè´¹
   * @param {*} txData 
   * @returns bool
   */
  isFree(txData) {
    const { value, gasPrice, input } = txData;
    const methodId = input.slice(0, 10);
    return +value === 0 && +gasPrice > 0 && methodId.length === 10;
  }

  /**
   * è·åmethodId
   * @param {*} txData 
   * @returns string
   */
  getMethodId(txData) {
    const { input } = txData;
    return input.slice(0, 10);
  }

  /**
   * å±ç¤ºè°ç¨å½æ°å
   * @param {*} name 
   */
  showFuncName(name) {
    name && console.log(`è°ç¨åçº¦å½æ° ${name}`);
  }

  async getMessage(data) {
    const osInfo = await this.getOpenSeaInfoByContract(data.to);
    console.log(osInfo);
    return `freeminté¡¹ç®${MIN}minç»§ç»­åçmint: 
    åç§°: ${osInfo?.collection?.name || 'æªç¥é¡¹ç®'}
    å®ç½: ${osInfo?.collection?.external_link || 'æ å®ç½ä¿¡æ¯'}
    åçº¦address: ${data.to}
    mintå½æ°: Function ${data.methodName} è°ç¨æ¬¡æ° ${data.count} æ¬¡
    åçº¦: https://etherscan.io/address/${data.to}#code
    OpenSea: ${osInfo?.collection?.slug ? `https://opensea.io/collection/${osInfo?.collection?.slug}` : 'æªç¥'}
    ç¨ç¹: ${osInfo?.seller_fee_basis_points ? `${osInfo.seller_fee_basis_points / 100}%` : 'æªç¥'}
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
          // è¾¾å°äºæå¤§è¯·æ±æ°,éè¦ç­å¾è¯·æ±æ°éä¸æ¥
          if (that.isFullQueryCount()) {
            console.log('è¯·æ±æ°å°è¾¾éå¶ï¼è·³è¿');
            return;
          }
          // è¿æ»¤å¼å¸¸äº¤æ
          if (!transactions || transactions.length === 0) return;
          for (let txHash of transactions) {
            const txData = await web3.eth.getTransaction(txHash);
            // è¿æ»¤éåè´¹åæ æ°æ®äº¤æ
            if (!txData) continue;
            if (!that.isFree(txData)) continue;

            const { to } = txData;
            const methodId = that.getMethodId(txData);
            // è·åç¼å­æ°æ®
            const old = contractMap.get(to);
            let methodName = '';
            if (old) {
              // è¿æ»¤æä¸æ¯mintçäºä»¶
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
              // è¿æ»¤ææ abiçæåµ
              if (!abis || !abis.length) continue;
              // è¿æ»¤æä¸æ¯mintçäºä»¶
              if (!that.isCallMint(abis, methodId)) continue;

              methodName = that.getMethodNameById(abis, methodId);
              // å­å¥ç¼å­æ°æ®
              contractMap.set(to, {
                count: 1,
                abis,
                methodName,
                to,
              });
            }
            that.showFuncName(methodName);
            console.log('çä¼¼ç½å«ï¼', txData);
          }
        }
        return;
      }
      
      that.sendMsg('èæ¬å¼å¸¸....', error);
      console.error(error);
    });
  }
}

export default new WatchDog();