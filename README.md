# 🧬 SagaSynth - Decentralized Synthetic Dataset Marketplace

**Transform sensitive data into monetizable synthetic datasets on blockchain**

SagaSynth is a decentralized platform that enables organizations to safely share data through AI-generated synthetic datasets, while creating a marketplace for researchers and developers to access quality training data through NFTs and bounty systems.

## 🎯 **Core Value Proposition**

### **For Data Owners** (Hospitals, Banks, Corporations)

- 🛡️ **Privacy-First**: Generate synthetic data that maintains statistical properties without exposing real information
- 💰 **Monetize Data**: Transform data liability into revenue streams through NFT ownership
- ⚖️ **Compliance**: Meet GDPR, HIPAA, and other privacy regulations while enabling data sharing
- 🔬 **Innovation**: Crowdsource R&D through bounty systems

### **For Researchers & Developers**

- 📊 **Quality Data**: Access real-world-like synthetic datasets for AI training
- 💎 **Verified Datasets**: Blockchain-verified data integrity through content hashing
- 🏆 **Earn Rewards**: Participate in research bounties and earn crypto rewards
- 🌐 **Global Access**: Decentralized marketplace accessible worldwide

## 🏗️ **Architecture Overview**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Data Input    │───▶│   AI Synthesis   │───▶│  Upload to Irys │
│ (Sensitive Real)│    │ (Privacy-Safe)   │    │ (Permanent Link)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   NFT Minting   │◀───│  Content Hashing │◀───│  Smart Contract │
│  (Ownership)    │    │ (Verification)   │    │    (Saga)       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                                               │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Marketplace   │───▶│    Donations     │───▶│ Bounty System   │
│  (Discovery)    │    │  (Monetization)  │    │  (Research)     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🚀 **Quick Start**

### **Prerequisites**

- Node.js 18+
- TypeScript
- Hardhat
- MetaMask or compatible wallet

### **Environment Setup**

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Required variables:
   ```
   PRIVATE_KEY=your_ethereum_private_key
   GEMINI_API_KEY=your_google_ai_api_key
   INFURA_RPC=your_ethereum_rpc_endpoint
   ```

### **Start the API Server**

```bash
npx ts-node api.ts
```

Server runs on `http://localhost:3001`

## 📡 **API Documentation**

### **🤖 AI Generation**

#### **Generate Synthetic Dataset**

```http
POST /api/generate
Content-Type: application/json

{
  "input_text": "Patient presents with persistent dry cough",
  "sample_size": 3,
  "dataset_name": "Medical Cough Dataset",
  "description": "Synthetic medical transcriptions",
  "tags": ["medical", "cough", "synthetic"],
  "model": "gemini-2.0-flash",
  "max_tokens": 3000
}
```

**Response:**

```json
{
  "success": true,
  "data": [...],
  "irys_links": {
    "content_url": "https://gateway.irys.xyz/...",
    "metadata_url": "https://gateway.irys.xyz/..."
  },
  "ready_for_nft": {
    "sourceUrl": "Patient presents with...",
    "contentLink": "https://gateway.irys.xyz/...",
    "tokenURI": "https://gateway.irys.xyz/...",
    "tags": ["medical", "cough", "synthetic"]
  }
}
```

#### **One-Click Generate + Mint NFT**

```http
POST /api/generate-and-mint
Content-Type: application/json

{
  "input_text": "Patient has diabetes and high blood pressure",
  "sample_size": 3,
  "dataset_name": "Diabetes Dataset",
  "tags": ["medical", "diabetes"]
}
```

**Response:**

```json
{
  "success": true,
  "tokenId": "8",
  "transactionHash": "0x...",
  "donation_info": {
    "tokenId": "8",
    "donateEndpoint": "/api/nft/8/donate"
  }
}
```

### **🎨 NFT Management**

#### **Upload Dataset to Irys**

```http
POST /api/dataset/upload
Content-Type: application/json

{
  "data": [...],
  "metadata": {
    "name": "Dataset Name",
    "description": "Dataset description",
    "tags": ["tag1", "tag2"]
  }
}
```

#### **Mint NFT for Dataset**

```http
POST /api/nft/mint
Content-Type: application/json

{
  "sourceUrl": "Data source description",
  "contentHash": "0x...",
  "contentLink": "https://gateway.irys.xyz/...",
  "embedVectorId": "vector_123",
  "createdAt": 1703123456,
  "tags": ["medical", "synthetic"],
  "tokenURI": "https://gateway.irys.xyz/metadata..."
}
```

#### **Get NFT Details**

```http
GET /api/nft/{tokenId}
```

#### **Get Creator's NFTs**

```http
GET /api/nft/creator/{address}
```

### **💰 Monetization**

#### **Donate to Dataset Creator**

```http
POST /api/nft/{tokenId}/donate
Content-Type: application/json

{
  "amount": "0.01"
}
```

#### **Get Marketplace NFTs**

```http
GET /api/marketplace/nfts
```

#### **Preview Dataset**

```http
GET /api/dataset/preview?url={irysUrl}
```

## 🎯 **Use Cases**

### **Medical Research Institution**

```bash
# 1. Generate synthetic patient data
POST /api/generate-and-mint
{
  "input_text": "Patient presents with chest pain and shortness of breath",
  "dataset_name": "Cardiology Emergency Dataset",
  "tags": ["medical", "cardiology", "emergency"]
}

# Response: { "tokenId": "12" }

# 2. Researchers can now access and donate
POST /api/nft/12/donate
{ "amount": "0.05" }
```

### **Financial Institution**

```bash
# Generate fraud detection training data
POST /api/generate-and-mint
{
  "input_text": "Suspicious transaction: $5000 transfer at 3AM to unknown account",
  "dataset_name": "Fraud Detection Dataset",
  "tags": ["financial", "fraud", "security"]
}
```

### **E-commerce Platform**

```bash
# Customer behavior patterns
POST /api/generate-and-mint
{
  "input_text": "Customer browses electronics, adds items to cart, abandons checkout",
  "dataset_name": "Customer Journey Dataset",
  "tags": ["ecommerce", "behavior", "analytics"]
}
```

## 🔧 **Smart Contract Integration**

### **Contract Address**

```
Saga Network: 0x6251C36F321aeEf6F06ED0fdFcd597862e784D06
```

### **Key Functions**

- `mintMetadataNFT()` - Create NFT for dataset
- `donateToCreator()` - Send ETH to dataset owner
- `getMetadata()` - Retrieve NFT metadata
- `getMetadataByCreator()` - Get all NFTs by address

### **Deploy Your Own Contract**

```bash
# Compile contracts
npx hardhat compile

# Deploy to Saga network
npx hardhat run scripts/deploy.ts --network saga

# Verify deployment
npx hardhat run scripts/interact.ts
```

## 🧪 **Testing**

### **API Testing with Postman**

1. Import the Postman collection (see `/docs/postman_collection.json`)
2. Set environment variables:
   - `base_url`: `http://localhost:3001`
   - `token_id`: Your minted NFT token ID

### **Complete Workflow Test**

```bash
# 1. Generate data
curl -X POST http://localhost:3001/api/generate-and-mint \
  -H "Content-Type: application/json" \
  -d '{"input_text": "Test medical data", "dataset_name": "Test Dataset"}'

# 2. Get token ID from response, then donate
curl -X POST http://localhost:3001/api/nft/{tokenId}/donate \
  -H "Content-Type: application/json" \
  -d '{"amount": "0.001"}'

# 3. Verify marketplace
curl http://localhost:3001/api/marketplace/nfts
```

## 💼 **Business Model**

### **Revenue Streams**

- **Transaction Fees**: 2-5% on NFT minting and sales
- **Bounty Platform**: 1-3% on research bounty creation
- **Premium Features**: Advanced AI models and analytics
- **Enterprise Plans**: White-label solutions for institutions

### **Market Opportunity**

- Healthcare Data Market: $34B by 2025
- Financial Data Market: $12B
- Total Addressable Market: $50B+

## 🛡️ **Privacy & Security**

### **Data Protection**

- ✅ No real PII stored on-chain
- ✅ Synthetic data maintains statistical properties
- ✅ Content hashing ensures data integrity
- ✅ Decentralized storage via Irys/IPFS

### **Compliance**

- GDPR compliant synthetic data generation
- HIPAA-compatible for medical datasets
- SOX compliance for financial data
- Audit trails through blockchain transactions

## 🌐 **Frontend Integration**

### **React/TypeScript Example**

```typescript
// Generate and mint NFT
const createDataset = async (inputText: string) => {
  const response = await fetch("/api/generate-and-mint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input_text: inputText,
      dataset_name: "My Dataset",
      tags: ["synthetic"],
    }),
  });

  const result = await response.json();
  return result.tokenId; // Use for donations
};

// Donate to creator
const donateToDataset = async (tokenId: string, amount: string) => {
  const response = await fetch(`/api/nft/${tokenId}/donate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount }),
  });

  return response.json();
};
```

## 📈 **Roadmap**

### **Phase 1: MVP** ✅

- [x] AI synthetic data generation
- [x] Irys upload integration
- [x] NFT minting on Saga
- [x] Basic donation system
- [x] API endpoints

### **Phase 2: Marketplace** (In Progress)

- [ ] Frontend marketplace UI
- [ ] MetaMask wallet integration
- [ ] Dataset search and filtering
- [ ] User profiles and reputation

### **Phase 3: Advanced Features**

- [ ] Bounty system implementation
- [ ] Multi-chain support
- [ ] Advanced AI models
- [ ] Analytics dashboard
- [ ] Enterprise features

### **Phase 4: Scale**

- [ ] Mobile app
- [ ] Institutional partnerships
- [ ] Regulatory compliance tools
- [ ] Global marketplace

## 🤝 **Contributing**

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📄 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 **Support**

- **Documentation**: [docs.sagasynth.io](https://docs.sagasynth.io)
- **Discord**: [discord.gg/sagasynth](https://discord.gg/sagasynth)
- **Email**: support@sagasynth.io
- **Issues**: [GitHub Issues](https://github.com/sagasynth/issues)

---

**Built with ❤️ for the decentralized future of data sharing**
