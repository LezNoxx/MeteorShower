// Wallet Manager - Gestion complète des wallets Solana
// =====================================================

class WalletManager {
    constructor() {
        this.currentWallet = null;
        this.wallets = this.loadWallets();
    }

    // Génération d'un nouveau wallet
    generateWallet(name = 'Nouveau Wallet') {
        try {
            const keypair = window.solanaWeb3.Keypair.generate();
            const wallet = {
                id: this.generateId(),
                name: name,
                publicKey: keypair.publicKey.toBase58(),
                privateKey: Array.from(keypair.secretKey),
                created: new Date().toISOString(),
                encrypted: false
            };
            
            return wallet;
        } catch (error) {
            throw new Error('Erreur lors de la génération du wallet: ' + error.message);
        }
    }

    // Import d'un wallet depuis une clé privée
    importFromPrivateKey(privateKeyInput, name = 'Wallet Importé') {
        try {
            let privateKeyArray;
            
            // Essayer de parser comme JSON
            try {
                privateKeyArray = JSON.parse(privateKeyInput);
            } catch {
                // Essayer de décoder comme base58
                try {
                    privateKeyArray = Array.from(window.bs58.decode(privateKeyInput));
                } catch {
                    // Essayer comme array de nombres séparés par des virgules
                    try {
                        privateKeyArray = privateKeyInput.split(',').map(n => parseInt(n.trim()));
                    } catch {
                        throw new Error('Format de clé privée invalide');
                    }
                }
            }

            if (!Array.isArray(privateKeyArray) || privateKeyArray.length !== 64) {
                throw new Error('La clé privée doit contenir exactement 64 bytes');
            }

            const keypair = window.solanaWeb3.Keypair.fromSecretKey(new Uint8Array(privateKeyArray));
            
            const wallet = {
                id: this.generateId(),
                name: name,
                publicKey: keypair.publicKey.toBase58(),
                privateKey: privateKeyArray,
                created: new Date().toISOString(),
                imported: true,
                encrypted: false
            };

            return wallet;
        } catch (error) {
            throw new Error('Erreur lors de l\'import: ' + error.message);
        }
    }

    // Import depuis un fichier JSON
    async importFromFile(file, name = 'Wallet Importé') {
        try {
            const content = await this.readFileAsText(file);
            const keyData = JSON.parse(content);
            
            // Vérifier si c'est un format de wallet valide
            if (Array.isArray(keyData)) {
                // Format clé privée directe
                return this.importFromPrivateKey(JSON.stringify(keyData), name);
            } else if (keyData.privateKey) {
                // Format wallet complet
                return {
                    id: this.generateId(),
                    name: name,
                    publicKey: keyData.publicKey,
                    privateKey: keyData.privateKey,
                    created: new Date().toISOString(),
                    imported: true,
                    encrypted: false
                };
            } else {
                throw new Error('Format de fichier non reconnu');
            }
        } catch (error) {
            throw new Error('Erreur lors de l\'import du fichier: ' + error.message);
        }
    }

    // Chiffrement d'un wallet avec mot de passe
    async encryptWallet(wallet, password) {
        if (!password) return wallet;
        
        try {
            // Utiliser une méthode de chiffrement simple (en production, utiliser crypto-js)
            const encrypted = btoa(JSON.stringify(wallet.privateKey) + '|' + password);
            
            return {
                ...wallet,
                privateKey: encrypted,
                encrypted: true
            };
        } catch (error) {
            throw new Error('Erreur lors du chiffrement: ' + error.message);
        }
    }

    // Déchiffrement d'un wallet
    async decryptWallet(wallet, password) {
        if (!wallet.encrypted) return wallet;
        
        try {
            const decrypted = atob(wallet.privateKey);
            const [privateKeyStr, originalPassword] = decrypted.split('|');
            
            if (originalPassword !== password) {
                throw new Error('Mot de passe incorrect');
            }
            
            return {
                ...wallet,
                privateKey: JSON.parse(privateKeyStr),
                encrypted: false
            };
        } catch (error) {
            throw new Error('Erreur lors du déchiffrement: ' + error.message);
        }
    }

    // Sauvegarde d'un wallet
    saveWallet(wallet) {
        this.wallets[wallet.id] = wallet;
        this.saveWallets();
        return wallet;
    }

    // Suppression d'un wallet
    deleteWallet(walletId) {
        if (this.currentWallet && this.currentWallet.id === walletId) {
            this.currentWallet = null;
        }
        delete this.wallets[walletId];
        this.saveWallets();
    }

    // Définir le wallet actuel
    setCurrentWallet(wallet) {
        this.currentWallet = wallet;
        localStorage.setItem('meteorshower_current_wallet', JSON.stringify(wallet));
    }

    // Obtenir le wallet actuel
    getCurrentWallet() {
        if (!this.currentWallet) {
            const saved = localStorage.getItem('meteorshower_current_wallet');
            if (saved) {
                try {
                    this.currentWallet = JSON.parse(saved);
                } catch (error) {
                    console.error('Erreur lors du chargement du wallet actuel:', error);
                }
            }
        }
        return this.currentWallet;
    }

    // Obtenir tous les wallets
    getAllWallets() {
        return Object.values(this.wallets);
    }

    // Obtenir un wallet par ID
    getWallet(walletId) {
        return this.wallets[walletId];
    }

    // Obtenir le keypair Solana d'un wallet
    getKeypair(wallet) {
        if (wallet.encrypted) {
            throw new Error('Le wallet est chiffré. Déchiffrez-le d\'abord.');
        }
        
        return window.solanaWeb3.Keypair.fromSecretKey(new Uint8Array(wallet.privateKey));
    }

    // Export d'un wallet
    exportWallet(wallet, format = 'json') {
        const exportData = {
            name: wallet.name,
            publicKey: wallet.publicKey,
            privateKey: wallet.privateKey,
            created: wallet.created,
            exported: new Date().toISOString()
        };

        switch (format) {
            case 'json':
                return JSON.stringify(exportData, null, 2);
            case 'privatekey':
                return JSON.stringify(wallet.privateKey);
            case 'base58':
                return window.bs58.encode(new Uint8Array(wallet.privateKey));
            default:
                throw new Error('Format d\'export non supporté');
        }
    }

    // Vérification de la validité d'un wallet
    validateWallet(wallet) {
        try {
            if (!wallet.publicKey || !wallet.privateKey) {
                return false;
            }
            
            if (wallet.encrypted) {
                return true; // On ne peut pas valider un wallet chiffré
            }
            
            const keypair = this.getKeypair(wallet);
            return keypair.publicKey.toBase58() === wallet.publicKey;
        } catch (error) {
            return false;
        }
    }

    // Obtenir le solde d'un wallet
    async getBalance(wallet, connection) {
        try {
            const publicKey = new window.solanaWeb3.PublicKey(wallet.publicKey);
            const balance = await connection.getBalance(publicKey);
            return balance / window.solanaWeb3.LAMPORTS_PER_SOL;
        } catch (error) {
            throw new Error('Erreur lors de la récupération du solde: ' + error.message);
        }
    }

    // Méthodes utilitaires privées
    generateId() {
        return 'wallet_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    loadWallets() {
        try {
            const saved = localStorage.getItem('meteorshower_wallets');
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            console.error('Erreur lors du chargement des wallets:', error);
            return {};
        }
    }

    saveWallets() {
        try {
            localStorage.setItem('meteorshower_wallets', JSON.stringify(this.wallets));
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des wallets:', error);
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    // Nettoyage des données sensibles
    clearSensitiveData() {
        this.currentWallet = null;
        localStorage.removeItem('meteorshower_current_wallet');
    }

    // Backup de tous les wallets
    backupAllWallets() {
        const backup = {
            wallets: this.wallets,
            created: new Date().toISOString(),
            version: '1.0'
        };
        
        return JSON.stringify(backup, null, 2);
    }

    // Restauration depuis un backup
    restoreFromBackup(backupData) {
        try {
            const backup = JSON.parse(backupData);
            
            if (!backup.wallets || !backup.version) {
                throw new Error('Format de backup invalide');
            }
            
            // Valider chaque wallet
            for (const [id, wallet] of Object.entries(backup.wallets)) {
                if (!this.validateWallet(wallet)) {
                    console.warn(`Wallet ${id} invalide, ignoré`);
                    delete backup.wallets[id];
                }
            }
            
            this.wallets = { ...this.wallets, ...backup.wallets };
            this.saveWallets();
            
            return Object.keys(backup.wallets).length;
        } catch (error) {
            throw new Error('Erreur lors de la restauration: ' + error.message);
        }
    }
}

// Export pour utilisation globale
window.WalletManager = WalletManager;