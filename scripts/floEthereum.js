(function (EXPORTS) { //floEthereum v1.0.1a
    /* FLO Ethereum Operators */
    'use strict';
    const floEthereum = EXPORTS;
    const ETHERSCAN_API_KEY = 'UIQ1Q1TVXRWD3K17AK3D7UZB5IJYCWCD7Y'; // Your Etherscan API key

    // Address and key utilities (existing functions remain the same)
    const ethAddressFromPrivateKey = floEthereum.ethAddressFromPrivateKey = function (privateKey, onlyEvenY = false) {
        var t1, t1_x, t1_y, t1_y_BigInt, t2, t3, t4;
        var groupOrder = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F");

        t1 = bitjs.newPubkey(privateKey);
        t1_x = t1.slice(2, 66); t1_y = t1.slice(-64);
        if (onlyEvenY) {
            t1_y_BigInt = BigInt("0x" + t1_y);
            if (t1_y_BigInt % 2n !== 0n) { t1_y_BigInt = (groupOrder - t1_y_BigInt) % groupOrder; t1_y = t1_y_BigInt.toString(16) }
        };

        t2 = t1_x.toString(16) + t1_y.toString(16);
        t3 = keccak.keccak_256(Crypto.util.hexToBytes(t2));
        t4 = keccak.extractLast20Bytes(t3);
        return "0x" + t4;
    };

    const ethAddressFromCompressedPublicKey = floEthereum.ethAddressFromCompressedPublicKey = function (compressedPublicKey) {
        var t1, t2, t3, t4;
        t1 = coinjs.compressedToUncompressed(compressedPublicKey);
        t2 = t1.slice(2);
        t3 = keccak.keccak_256(Crypto.util.hexToBytes(t2));
        t4 = keccak.extractLast20Bytes(t3);
        return "0x" + t4;
    };

    const ethPrivateKeyFromUntweakedPrivateKey = floEthereum.ethPrivateKeyFromUntweakedPrivateKey = function (untweakedPrivateKey) {
        var t1;
        t1 = hex.encode(taproot.taprootTweakPrivKey(hex.decode(untweakedPrivateKey)));
        return t1;
    };

    const ethAddressFromUntweakedPrivateKey = floEthereum.ethAddressFromUntweakedPrivateKey = function (untweakedPrivateKey) {
        var t1, t2;
        t1 = hex.encode(taproot.taprootTweakPrivKey(hex.decode(untweakedPrivateKey)));
        t2 = ethAddressFromPrivateKey(t1);
        return t2;
    };

    const ethAddressFromTaprootAddress = floEthereum.ethAddressFromTaprootAddress = function (taprootAddress) {
        var t1, t2, t3, t4;
        t1 = coinjs.addressDecode(taprootAddress);
        t2 = t1.outstring.slice(4);
        t3 = "02" + t2;
        t4 = ethAddressFromCompressedPublicKey(t3);
        return t4;
    };

    // Transaction History
    floEthereum.getEthereumTransactions = async function (address) {
        const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.status === "1") {
                return data.result.map(tx => ({
                    hash: tx.hash,
                    from: tx.from,
                    to: tx.to,
                    value: ethers.utils.formatEther(tx.value),
                    timestamp: parseInt(tx.timeStamp) * 1000,
                    gasPrice: ethers.utils.formatUnits(tx.gasPrice, 'gwei'),
                    gasUsed: tx.gasUsed,
                    confirmations: tx.confirmations,
                    isError: tx.isError === "1"
                }));
            } else {
                throw new Error(data.message || "Failed to fetch transactions");
            }
        } catch (error) {
            console.error("Failed to fetch Ethereum transactions:", error);
            throw error;
        }
    };

    // Transaction Details
    floEthereum.getEthereumTransactionDetails = async function (txHash) {
        try {
            // Get basic transaction details
            const txUrl = `https://api.etherscan.io/api?module=proxy&action=eth_getTransactionByHash&txhash=${txHash}&apikey=${ETHERSCAN_API_KEY}`;
            const txResponse = await fetch(txUrl);
            const txData = await txResponse.json();
            
            if (txData.error) {
                throw new Error(txData.error.message);
            }

            const transaction = txData.result;
            
            // Get transaction receipt (for gas used and status)
            const receiptUrl = `https://api.etherscan.io/api?module=proxy&action=eth_getTransactionReceipt&txhash=${txHash}&apikey=${ETHERSCAN_API_KEY}`;
            const receiptResponse = await fetch(receiptUrl);
            const receiptData = await receiptResponse.json();
            
            if (receiptData.error) {
                throw new Error(receiptData.error.message);
            }

            const receipt = receiptData.result;
            
            // Format the response
            return {
                hash: transaction.hash,
                blockNumber: parseInt(transaction.blockNumber, 16),
                from: transaction.from,
                to: transaction.to,
                value: ethers.utils.formatEther(transaction.value),
                gasPrice: ethers.utils.formatUnits(transaction.gasPrice, 'gwei'),
                gasLimit: parseInt(transaction.gas, 16),
                gasUsed: parseInt(receipt.gasUsed, 16),
                nonce: parseInt(transaction.nonce, 16),
                input: transaction.input,
                status: receipt.status === "0x1" ? "Success" : "Failed",
                timestamp: await getBlockTimestamp(parseInt(transaction.blockNumber, 16))
            };
        } catch (error) {
            console.error("Failed to fetch Ethereum transaction details:", error);
            throw error;
        }
    };

    // Helper function to get block timestamp
    async function getBlockTimestamp(blockNumber) {
        const url = `https://api.etherscan.io/api?module=block&action=getblockreward&blockno=${blockNumber}&apikey=${ETHERSCAN_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === "1") {
            return parseInt(data.result.timeStamp) * 1000;
        }
        return null;
    }

    // Get ETH balance
    floEthereum.getEthereumBalance = async function (address) {
        const url = `https://api.etherscan.io/api?module=account&action=balance&address=${address}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (data.status === "1") {
                return ethers.utils.formatEther(data.result);
            } else {
                throw new Error(data.message || "Failed to fetch balance");
            }
        } catch (error) {
            console.error("Failed to fetch Ethereum balance:", error);
            throw error;
        }
    };

})('object' === typeof module ? module.exports : window.floEthereum = {});