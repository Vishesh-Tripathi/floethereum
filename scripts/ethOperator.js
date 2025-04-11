(function (EXPORTS) { //ethOperator v1.2.0
  /* ETH Crypto and API Operator */
  if (!window.ethers) 
      return console.error('ethers.js not found');
  
  const ethOperator = EXPORTS;
  const WEI_IN_ETH = 1e18;
  const ETHERSCAN_API_KEY = 'UIQ1Q1TVXRWD3K17AK3D7UZB5IJYCWCD7Y'; // Replace with your key

  const util = ethOperator.util = {};

  // Unit conversion helpers
  util.Wei_to_ETH = value => parseFloat((value / WEI_IN_ETH).toFixed(18));
  util.ETH_to_Wei = value => ethers.utils.parseEther(value.toString());

  // Provider management
  function getProvider() {
      if (window.ethereum) {
          return new ethers.providers.Web3Provider(window.ethereum);
      }
      return new ethers.providers.JsonRpcProvider('https://mainnet.infura.io/v3/05af952d0a5a453ea5e7b7093c43a07c');
  }

  // API endpoints
  const APIs = ethOperator.APIs = [
      {
          url: 'https://api.etherscan.io/api',
          name: 'Etherscan',
          balance({ addr }) {
              return fetch_api(`?module=account&action=balance&address=${addr}&tag=latest`, { 
                  url: this.url,
                  apiKey: ETHERSCAN_API_KEY 
              }).then(result => util.Wei_to_ETH(result.result));
          },
          tx({ txid }) {
              return fetch_api(`?module=proxy&action=eth_getTransactionByHash&txhash=${txid}`, {
                  url: this.url,
                  apiKey: ETHERSCAN_API_KEY
              }).then(result => formatTx(result.result));
          },
          txs({ addr }) {
              return fetch_api(`?module=account&action=txlist&address=${addr}&startblock=0&endblock=99999999&sort=desc`, {
                  url: this.url,
                  apiKey: ETHERSCAN_API_KEY
              }).then(result => result.result.map(tx => formatTx(tx)));
          },
          async broadcast({ rawTxHex }) {
              return post(`${this.url}?module=proxy&action=eth_sendRawTransaction&hex=${rawTxHex}&apikey=${ETHERSCAN_API_KEY}`);
          }
      },
      {
          url: 'https://cloudflare-eth.com',
          name: 'Cloudflare',
          balance({ addr }) {
              return fetch_api('/v1/mainnet', {
                  url: this.url,
                  method: 'POST',
                  body: JSON.stringify({
                      jsonrpc: "2.0",
                      method: "eth_getBalance",
                      params: [addr, "latest"],
                      id: 1
                  })
              }).then(result => util.Wei_to_ETH(result.result));
          },
          tx({ txid }) {
              return fetch_api('/v1/mainnet', {
                  url: this.url,
                  method: 'POST',
                  body: JSON.stringify({
                      jsonrpc: "2.0",
                      method: "eth_getTransactionByHash",
                      params: [txid],
                      id: 1
                  })
              }).then(result => formatTx(result.result));
          }
      }
  ];

  // Formatting functions
  ethOperator.util.format = {};
  
  const formatTx = ethOperator.util.format.tx = (tx) => {
      try {
          return {
              hash: tx.hash,
              from: tx.from,
              to: tx.to || null,
              value: util.Wei_to_ETH(tx.value),
              gasPrice: util.Wei_to_ETH(tx.gasPrice),
              gasLimit: parseInt(tx.gas, 16),
              nonce: parseInt(tx.nonce, 16),
              input: tx.input,
              blockNumber: tx.blockNumber ? parseInt(tx.blockNumber, 16) : null,
              transactionIndex: tx.transactionIndex ? parseInt(tx.transactionIndex, 16) : null
          };
      } catch (e) {
          throw e;
      }
  };

  // Multi-API fallback system
  const multiApi = ethOperator.multiApi = async (fnName, { index = 0, ...args } = {}) => {
      try {
          while (index < APIs.length) {
              if (!APIs[index][fnName] || (APIs[index].coolDownTime && APIs[index].coolDownTime > Date.now())) {
                  index += 1;
                  continue;
              }
              return await APIs[index][fnName](args);
          }
          throw "No API available";
      } catch (error) {
          console.error(error);
          APIs[index].coolDownTime = Date.now() + 1000 * 60 * 10; // 10 minutes cooldown
          return multiApi(fnName, { index: index + 1, ...args });
      }
  };

  // Address validation
  ethOperator.validateAddress = address => {
    try {
        console.log('Validating address:', address);
        const normalizedAddress = address.toLowerCase();
        const result = ethers.utils.isAddress(normalizedAddress);
        console.log('ethers.utils.isAddress result:', result);
        return result;
    } catch (e) {
        console.error('validateAddress error:', e);
        return false;
    }
};

  // Transaction parsing
  function parseTx(tx, addressOfTx) {
      const { hash, from, to, value, gasPrice } = tx;
      let parsedTx = {
          hash,
          from,
          to,
          value: util.Wei_to_ETH(value),
          gasPrice: util.Wei_to_ETH(gasPrice),
          type: from.toLowerCase() === addressOfTx.toLowerCase() ? 'out' : 'in'
      };
      
      if (parsedTx.type === 'out') {
          parsedTx.amount = parsedTx.value;
          parsedTx.receiver = to;
      } else {
          parsedTx.amount = parsedTx.value;
          parsedTx.sender = from;
      }
      
      return parsedTx;
  }

  // Fetch helper
  const fetch_api = ethOperator.fetch = function(api, { url, method = 'GET', apiKey, body, asText = false } = {}) {
      return new Promise((resolve, reject) => {
          const options = { method };
          if (body) options.body = body;
          
          let fullUrl = url + (apiKey ? api + `&apikey=${apiKey}` : api);
          
          if (method === 'GET' && body) {
              fullUrl += '&' + new URLSearchParams(body).toString();
          }
          
          fetch(fullUrl, options)
              .then(response => {
                  if (response.ok) {
                      return asText ? response.text() : response.json();
                  }
                  throw response;
              })
              .then(resolve)
              .catch(reject);
      });
  };

  // POST helper
  async function post(url, data, { asText = false } = {}) {
      try {
          const response = await fetch(url, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify(data)
          });
          
          if (response.ok) {
              return asText ? await response.text() : await response.json();
          }
          throw response;
      } catch (e) {
          throw e;
      }
  }

  // Broadcast transaction
  const broadcastTx = ethOperator.broadcastTx = rawTxHex => {
      return multiApi('broadcast', { rawTxHex });
  };

  // Key/address management
  Object.defineProperties(ethOperator, {
      newKeys: {
          get: () => {
              const wallet = ethers.Wallet.createRandom();
              return {
                  privateKey: wallet.privateKey,
                  address: wallet.address
              };
          }
      },
      addressFromPrivateKey: {
          value: privateKey => {
              try {
                  return new ethers.Wallet(privateKey).address;
              } catch {
                  return null;
              }
          }
      }
  });

  // Verify key matches address
  ethOperator.verifyKey = (address, key) => {
      try {
          const wallet = new ethers.Wallet(key);
          return wallet.address.toLowerCase() === address.toLowerCase();
      } catch {
          return false;
      }
  };

  // Balance checks
  ethOperator.getBalance = addr => {
      return new Promise((resolve, reject) => {
          if (!ethOperator.validateAddress(addr))
              return reject("Invalid address");
          multiApi('balance', { addr })
              .then(resolve)
              .catch(reject);
      });
  };

  // Token balance check
  ethOperator.getTokenBalance = (addr, tokenAddress) => {
      return new Promise((resolve, reject) => {
          if (!ethOperator.validateAddress(addr))
              return reject("Invalid address");
              
          const provider = getProvider();
          const contract = new ethers.Contract(
              tokenAddress, 
              [
                  "function balanceOf(address owner) view returns (uint256)",
                  "function decimals() view returns (uint8)"
              ], 
              provider
          );
          
          Promise.all([
              contract.balanceOf(addr),
              contract.decimals()
          ])
          .then(([balance, decimals]) => {
              resolve(parseFloat(ethers.utils.formatUnits(balance, decimals)));
          })
          .catch(reject);
      });
  };

  // Transaction history
  ethOperator.getTransactions = addr => {
      return new Promise((resolve, reject) => {
          if (!ethOperator.validateAddress(addr))
              return reject("Invalid address");
              
          multiApi('txs', { addr })
              .then(txs => resolve(txs.map(tx => parseTx(tx, addr))))
              .catch(reject);
      });
  };

  // Transaction details
  ethOperator.getTransaction = txid => {
      return new Promise((resolve, reject) => {
          if (!/^0x([A-Fa-f0-9]{64})$/.test(txid))
              return reject("Invalid transaction hash");
              
          multiApi('tx', { txid })
              .then(tx => resolve(formatTx(tx)))
              .catch(reject);
      });
  };

  // Create and send transactions
  ethOperator.createTransaction = ({ from, to, value, data = '0x', gasLimit, gasPrice }) => {
      return new Promise((resolve, reject) => {
          try {
              if (!ethOperator.validateAddress(from)) throw "Invalid sender address";
              if (to && !ethOperator.validateAddress(to)) throw "Invalid recipient address";
              
              const tx = {
                  from,
                  to,
                  value: util.ETH_to_Wei(value),
                  data,
                  gasLimit,
                  gasPrice: gasPrice ? util.ETH_to_Wei(gasPrice) : undefined
              };
              
              resolve(tx);
          } catch (error) {
              reject(error);
          }
      });
  };

  ethOperator.sendTransaction = ({ privateKey, to, value, data = '0x' }) => {
      return new Promise(async (resolve, reject) => {
          try {
              const provider = getProvider();
              const wallet = new ethers.Wallet(privateKey, provider);
              
              const tx = await ethOperator.createTransaction({
                  from: wallet.address,
                  to,
                  value,
                  data
              });
              
              const sentTx = await wallet.sendTransaction(tx);
              resolve(sentTx.hash);
          } catch (error) {
              reject(error);
          }
      });
  };

  // Token transfers
  ethOperator.sendToken = ({ privateKey, tokenAddress, to, value }) => {
      return new Promise(async (resolve, reject) => {
          try {
              const provider = getProvider();
              const wallet = new ethers.Wallet(privateKey, provider);
              const contract = new ethers.Contract(
                  tokenAddress,
                  [
                      "function transfer(address to, uint256 value) returns (bool)",
                      "function decimals() view returns (uint8)"
                  ],
                  wallet
              );
              
              const decimals = await contract.decimals();
              const amount = ethers.utils.parseUnits(value.toString(), decimals);
              
              const tx = await contract.transfer(to, amount);
              resolve(tx.hash);
          } catch (error) {
              reject(error);
          }
      });
  };

  // Address data aggregation
  ethOperator.getAddressData = address => {
      return new Promise((resolve, reject) => {
          Promise.all([
              ethOperator.getBalance(address),
              ethOperator.getTransactions(address)
          ])
          .then(([balance, txs]) => {
              resolve({
                  address,
                  balance,
                  txs
              });
          })
          .catch(reject);
      });
  };

})('object' === typeof module ? module.exports : window.ethOperator = {});