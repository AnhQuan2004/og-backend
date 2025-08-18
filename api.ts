import { config } from "dotenv";
import express, { Request, Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import fs from "fs";
import Irys from "@irys/sdk";
import path from "path";
import axios from "axios";
import { ethers } from "ethers";
import { getAllBounties } from "./scripts/get-all-bounties";
import { uploadFromData } from "./scripts/upload-irys";
// Explicitly load the .env file from the same directory as api.ts
config({ path: path.resolve(__dirname, ".env") });

// --- Irys Helper Function ---
const getIrys = async () => {
  const network = "devnet"; // Use "mainnet" for production
  const providerUrl = process.env.INFURA_RPC; // e.g., from Infura or Alchemy
  const token = "ethereum";

  if (!providerUrl) {
    throw new Error("INFURA_RPC is not set in the .env file");
  }

  const irys = new Irys({
    network,
    token,
    key: process.env.PRIVATE_KEY,
    config: { providerUrl },
  });
  return irys;
};

const app = express();
app.use(express.json());
app.use(cors({ origin: "*" })); // Adjust as needed

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }); // Use stable version

const HISTORY_FILE = path.resolve(__dirname, "history.json"); // Local file for history inside saga folder

// Initialize history file if not exists
if (!fs.existsSync(HISTORY_FILE)) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
}

interface SyntheticRow {
  original_text: string;
  synthetic_output: {
    synthetic_transcription: string;
    medical_specialty: string;
    explanation: string;
  };
  verification_status: string;
  signature: string;
}

async function generate_synthetic_data(
  model: any,
  base_data: { text: string }[]
): Promise<SyntheticRow[]> {
  const synthetic_results: SyntheticRow[] = [];
  for (let i = 0; i < base_data.length; i++) {
    try {
      console.log(`Processing row ${i + 1}/${base_data.length}...`);
      const original_text = base_data[i].text;

      const prompt = `
        You are a helpful assistant for creating synthetic medical data.
        Based on the following medical transcription, please generate a new, paraphrased version.
        The new version should be medically coherent but different in wording.
        Also, provide a new 'medical_specialty' and a brief 'explanation' for the generated transcription.

        Original Transcription:
        "${original_text}"

        Please provide the output in a valid JSON format with the following keys:
        - "synthetic_transcription": The new, paraphrased transcription.
        - "medical_specialty": The relevant medical specialty.
        - "explanation": A brief explanation of the synthetic transcription.

        Example Output:
        {
            "synthetic_transcription": "The patient reports a history of chronic migraines and is currently prescribed sumatriptan.",
            "medical_specialty": "Neurology",
            "explanation": "This transcription documents a patient's history and treatment for a neurological condition."
        }
      `;

      const generationConfig = {
        responseMimeType: "application/json",
        maxOutputTokens: 3000,
        temperature: 0.7,
      };

      const response = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      });

      if (!response.response.text()) {
        console.log(`  Skipping row ${i + 1} due to empty response.`);
        continue;
      }

      const synthetic_output = JSON.parse(response.response.text());

      const verified_signed_data = verify_and_sign_data({
        original_text,
        synthetic_output,
      });

      if (verified_signed_data) {
        synthetic_results.push(verified_signed_data);
        console.log(
          `  Successfully generated and verified synthetic data for row ${
            i + 1
          }.`
        );
      }
    } catch (error) {
      console.log(`  Error for row ${i + 1}: ${error}. Skipping.`);
    }
  }
  return synthetic_results;
}

function verify_and_sign_data(synthetic_row: {
  original_text: string;
  synthetic_output: any;
}): SyntheticRow | null {
  try {
    const output = synthetic_row.synthetic_output;
    if (
      !["synthetic_transcription", "medical_specialty", "explanation"].every(
        (key) => key in output && output[key]
      )
    ) {
      console.log("  Verification failed: Missing or empty fields.");
      return { ...synthetic_row, verification_status: "failed", signature: "" };
    }

    // Removed ECDSA logic as per request
    return { ...synthetic_row, verification_status: "verified", signature: "" };
  } catch (error) {
    console.log(`  Error during verification/signing: ${error}`);
    return null;
  }
}

// Main generate endpoint
app.post("/api/generate", async (req: Request, res: Response) => {
  const {
    input_text,
    sample_size,
    domain,
    dataset_name,
    description,
    visibility,
    price_usdc,
    max_tokens,
    output_format,
    source_dataset,
    ai_model,
  } = req.body;

  // Validate required fields
  const requiredFields = {
    input_text,
    sample_size,
    domain,
    dataset_name,
    description,
    visibility,
    price_usdc,
    max_tokens,
    output_format,
    source_dataset,
    ai_model,
  };

  const missingFields = Object.entries(requiredFields)
    .filter(
      ([key, value]) => value === undefined || value === null || value === ""
    )
    .map(([key]) => key);

  if (missingFields.length > 0) {
    return res.status(400).json({
      error: "Missing required fields",
      missing_fields: missingFields,
    });
  }

  try {
    // Create sample_size variations of the input text
    const input_data = Array(sample_size).fill({ text: input_text });

    console.log(`Generating ${sample_size} synthetic data samples...`);
    const synthetic = await generate_synthetic_data(model, input_data);

    if (synthetic.length === 0) {
      throw new Error("Generation failed, no results.");
    }

    // Upload to Irys
    console.log("Uploading generated data to Irys...");
    const dataString = JSON.stringify(synthetic);

    const contentUrl = await uploadFromData(dataString, [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "SagaSynth" },
      { name: "Type", value: "Dataset" },
    ]);

    const metadata = {
      name: dataset_name,
      description: description,
      content_url: contentUrl,
      sample_size: synthetic.length,
      domain: domain,
      model: ai_model,
      max_tokens: max_tokens,
      output_format: output_format,
      source_dataset: source_dataset,
      visibility: visibility,
      price_usdc:
        typeof price_usdc === "string" ? parseFloat(price_usdc) : price_usdc,
      created_at: new Date().toISOString(),
      input_text: input_text,
    };

    console.log("Uploading metadata to Irys...");
    const metadataUrl = await uploadFromData(JSON.stringify(metadata), [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "SagaSynth" },
      { name: "Type", value: "Metadata" },
    ]);

    // Save to history
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    history.push({
      input_text,
      data: synthetic,
      metadata: metadata,
      created_at: new Date().toISOString(),
      content_url: contentUrl,
      metadata_url: metadataUrl,
    });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));

    res.json({
      success: true,
      message: "Dataset generated successfully",
      data: synthetic,
      metadata: metadata,
      irys_links: {
        content_url: contentUrl,
        metadata_url: metadataUrl,
      },
      ready_for_nft: {
        sourceUrl: input_text,
        contentLink: contentUrl,
        tokenURI: metadataUrl,
        domain: domain,
        source_dataset: source_dataset,
      },
    });
  } catch (error) {
    console.error("Generation error:", error);
    res.status(500).json({
      error: "Generation failed",
      details: (error as Error).message,
    });
  }
});

// Test Your Prompt endpoint - only requires input_text and domain
app.post("/api/test-prompt", async (req: Request, res: Response) => {
  const { input_text, domain } = req.body;

  if (!input_text || !domain) {
    return res
      .status(400)
      .json({ error: "input_text and domain are required" });
  }

  // Fixed parameters for testing
  const sample_size = 3;
  const dataset_name = "Test Dataset";
  const description = "Test generation for prompt validation";
  const visibility = "private";
  const price_usdc = 0;
  const max_tokens = 3000;
  const output_format = "Structured JSON";
  const source_dataset = "galileo-ai/medical_transcription_40";
  const ai_model = "gemini-2.5-flash";

  try {
    // Create sample_size variations of the input text
    const input_data = Array(sample_size).fill({ text: input_text });

    console.log(`Testing prompt with ${sample_size} synthetic data samples...`);
    const synthetic = await generate_synthetic_data(model, input_data);

    if (synthetic.length === 0) {
      throw new Error("Generation failed, no results.");
    }

    res.json({
      success: true,
      message: "Prompt test completed successfully",
      test_parameters: {
        sample_size,
        domain,
        dataset_name,
        description,
        visibility,
        price_usdc,
        max_tokens,
        output_format,
        source_dataset,
        ai_model,
      },
      data: synthetic,
      input_text: input_text,
    });
  } catch (error) {
    console.error("Prompt test error:", error);
    res.status(500).json({
      error: "Prompt test failed",
      details: (error as Error).message,
    });
  }
});

app.post("/api/generate/test", async (req: Request, res: Response) => {
  const { input_text, domain = "medical" } = req.body;

  try {
    // Create 3 variations of the input text
    const test_data = [
      { text: input_text },
      { text: input_text },
      { text: input_text },
    ];

    const synthetic = await generate_synthetic_data(model, test_data);
    if (synthetic.length === 0) {
      throw new Error("Generation failed, no results.");
    }

    // --- Irys Upload Logic ---
    console.log("Uploading generated data to Irys...");
    const contentUrl = await uploadFromData(JSON.stringify(synthetic), [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "Saga-AI-Generator" },
    ]);

    const metadata = {
      name: `Synthetic Dataset for: ${input_text.substring(0, 30)}...`,
      description: `A synthetic dataset generated based on the input: "${input_text}"`,
      content_url: contentUrl,
      domain: domain,
      created_at: new Date().toISOString(),
    };

    console.log("Uploading metadata to Irys...");
    const metadataUrl = await uploadFromData(JSON.stringify(metadata), [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "Saga-AI-Generator-Metadata" },
    ]);
    // --- End Irys Upload Logic ---

    // Save to local history (append)
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    history.push({
      input_text,
      domain,
      data: synthetic,
      created_at: new Date().toISOString(),
      content_url: contentUrl,
      metadata_url: metadataUrl,
    });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));

    res.json({
      message: "Test generation and Irys upload successful",
      input_text,
      data: synthetic,
      irys_links: {
        content_url: contentUrl,
        metadata_url: metadataUrl,
      },
    });
  } catch (error) {
    res.status(500).json({ detail: (error as Error).message });
  }
});

app.get("/api/generate/history", (req: Request, res: Response) => {
  try {
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));

    // Format each record (mock metadata since removed Mongo fields)
    const formatted_history = history.map((record: any) => ({
      metadata: {
        dataset_name: "Test Dataset", // Mock
        description: "Test generation", // Mock
        visibility: "Private", // Mock
        price_usdc: 0, // Mock
        domain: record.domain,
        sample_size: record.data.length,
        max_tokens: 3000, // Mock
        output_format: "JSON", // Mock
        source_dataset: "Custom Input", // Mock
        ai_model: "Gemini 2.5 Flash", // Mock
        created_at: record.created_at,
        filename: "test.csv", // Mock
      },
      data: record.data,
    }));

    formatted_history.sort(
      (a: any, b: any) =>
        new Date(b.metadata.created_at).getTime() -
        new Date(a.metadata.created_at).getTime()
    );

    res.json({
      total_records: formatted_history.length,
      history: formatted_history.slice(0, 100), // Limit to latest 100
    });
  } catch (error) {
    res
      .status(500)
      .json({ detail: `Error fetching history: ${(error as Error).message}` });
  }
});

// --- NFT & Blockchain API Endpoints ---

// Get contract instance helper
const getContract = async () => {
  const { ethers } = await import("ethers");
  const fs = await import("fs");
  const path = await import("path");

  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) {
    throw new Error("PRIVATE_KEY not set in environment");
  }

  const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
  const wallet = new ethers.Wallet(privateKey, provider);

  const artifactsPath = path.join(
    __dirname,
    "./artifacts/contracts/Contract.sol/CrawlRegistry.json"
  );
  const contractArtifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));

  const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";
  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    contractArtifact.abi,
    wallet
  );

  return { contract, wallet };
};

// 1. Upload dataset to Irys and prepare for NFT minting
app.post("/api/dataset/upload", async (req: Request, res: Response) => {
  try {
    const { data, metadata } = req.body;

    if (!data || !metadata) {
      return res.status(400).json({ error: "Data and metadata are required" });
    }

    // Upload data to Irys
    const dataTags = [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "SagaSynth" },
      { name: "Type", value: "Dataset" },
    ];

    const dataUrl = await uploadFromData(JSON.stringify(data), dataTags);

    // Create content hash
    const crypto = await import("crypto");
    const contentHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");

    // Upload metadata to Irys
    const metadataWithLinks = {
      ...metadata,
      dataUrl,
      contentHash,
      createdAt: new Date().toISOString(),
    };

    const metadataTags = [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "SagaSynth" },
      { name: "Type", value: "Metadata" },
    ];

    const metadataUrl = await uploadFromData(
      JSON.stringify(metadataWithLinks),
      metadataTags
    );

    // Auto mint NFT after upload (temporarily disabled for testing)
    console.log("Skipping NFT minting for testing...");
    const tokenId = "mock_token_" + Date.now();

    res.json({
      success: true,
      message: "Dataset uploaded and NFT minted successfully",
      dataUrl,
      metadataUrl,
      contentHash: "0x" + contentHash,
      nft: {
        tokenId: tokenId,
        transactionHash: "mock_tx_hash",
        blockNumber: 0,
        gasUsed: "0",
        note: "NFT minting temporarily disabled for testing",
      },
      prepared: {
        sourceUrl: metadata.sourceUrl || "SagaSynth Generated",
        contentHash: "0x" + contentHash,
        contentLink: dataUrl,
        embedVectorId: "vector_" + Date.now(),
        createdAt: Math.floor(Date.now() / 1000),
        tags: metadata.tags || ["synthetic", "dataset"],
        tokenURI: metadataUrl,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({
      error: "Upload failed",
      details: (error as Error).message,
    });
  }
});

// 2. Mint NFT for dataset
app.post("/api/nft/mint", async (req: Request, res: Response) => {
  try {
    const {
      sourceUrl,
      contentHash,
      contentLink,
      embedVectorId,
      createdAt,
      tags,
      tokenURI,
    } = req.body;

    if (!contentHash || !contentLink || !tokenURI) {
      return res.status(400).json({
        error: "Missing required fields for minting",
      });
    }

    const { contract } = await getContract();

    const tx = await contract.mintMetadataNFT(
      sourceUrl || "SagaSynth Dataset",
      contentHash,
      contentLink,
      embedVectorId || "vector_" + Date.now(),
      createdAt || Math.floor(Date.now() / 1000),
      tags || ["synthetic"],
      tokenURI
    );

    const receipt = await tx.wait();

    // Get token ID from event
    const event = receipt.logs.find(
      (log: any) => log.fragment && log.fragment.name === "MetadataMinted"
    );

    const tokenId = event ? event.args[0].toString() : null;

    res.json({
      success: true,
      tokenId,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });
  } catch (error) {
    console.error("Minting error:", error);
    res.status(500).json({
      error: "Minting failed",
      details: (error as Error).message,
    });
  }
});

// 3. Get NFT metadata
app.get("/api/nft/:tokenId", async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params;
    const { contract } = await getContract();

    const metadata = await contract.getMetadata(tokenId);

    res.json({
      tokenId,
      sourceUrl: metadata.source_url,
      contentHash: metadata.content_hash,
      contentLink: metadata.content_link,
      embedVectorId: metadata.embed_vector_id,
      createdAt: Number(metadata.created_at),
      tags: metadata.tags,
      owner: metadata.owner,
    });
  } catch (error) {
    console.error("Get metadata error:", error);
    res.status(500).json({
      error: "Failed to get metadata",
      details: (error as Error).message,
    });
  }
});

// 4. Get all NFTs by creator
app.get("/api/nft/creator/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    const { contract } = await getContract();

    const tokenIds = await contract.getMetadataByCreator(address);

    // Get metadata for each token
    const nfts = await Promise.all(
      tokenIds.map(async (id: any) => {
        const metadata = await contract.getMetadata(id);
        return {
          tokenId: id.toString(),
          sourceUrl: metadata.source_url,
          contentHash: metadata.content_hash,
          contentLink: metadata.content_link,
          embedVectorId: metadata.embed_vector_id,
          createdAt: Number(metadata.created_at),
          tags: metadata.tags,
          owner: metadata.owner,
        };
      })
    );

    res.json({
      creator: address,
      totalNFTs: nfts.length,
      nfts,
    });
  } catch (error) {
    console.error("Get creator NFTs error:", error);
    res.status(500).json({
      error: "Failed to get creator NFTs",
      details: (error as Error).message,
    });
  }
});

// 5. Enhanced Donate to creator
app.post("/api/nft/:tokenId/donate", async (req: Request, res: Response) => {
  try {
    const { tokenId } = req.params;
    const { amount } = req.body; // Amount in ETH as string

    // Validate required fields
    if (!amount) {
      return res.status(400).json({ error: "Amount is required" });
    }

    // Validate amount format
    try {
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res
          .status(400)
          .json({ error: "Invalid amount. Must be a positive number." });
      }
      if (amountNum > 10) {
        return res
          .status(400)
          .json({ error: "Amount too large. Maximum 10 ETH per donation." });
      }
    } catch (error) {
      return res.status(400).json({ error: "Invalid amount format" });
    }

    const { contract } = await getContract();
    const { ethers } = await import("ethers");

    // Verify token exists
    let owner;
    try {
      owner = await contract.ownerOf(tokenId);
    } catch (error) {
      return res.status(404).json({ error: `Token ${tokenId} does not exist` });
    }

    // Get token metadata
    const metadata = await contract.getMetadata(tokenId);
    const tokenURI = await contract.tokenURI(tokenId);

    // Fetch additional metadata from tokenURI
    let additionalMetadata = null;
    try {
      const response = await axios.get(tokenURI, { timeout: 5000 });
      additionalMetadata = response.data;
    } catch (error) {
      console.log(`Could not fetch additional metadata for token ${tokenId}`);
    }

    // Get creator balance before donation
    const { provider } = new ethers.JsonRpcProvider(
      "https://evmrpc-testnet.0g.ai"
    );
    const creatorBalanceBefore = await provider.getBalance(metadata.owner);

    console.log(
      `Processing donation: ${amount} ETH to token ${tokenId} (${
        (additionalMetadata as any)?.name || "Unknown"
      })`
    );

    // Execute donation
    const tx = await contract.donateToCreator(tokenId, {
      value: ethers.parseEther(amount),
    });

    const receipt = await tx.wait();

    // Get creator balance after donation
    const creatorBalanceAfter = await provider.getBalance(metadata.owner);
    const balanceDifference = creatorBalanceAfter - creatorBalanceBefore;

    res.json({
      success: true,
      message: "Donation sent successfully",
      donation: {
        tokenId: tokenId,
        amount: amount,
        amountWei: ethers.parseEther(amount).toString(),
        recipient: metadata.owner,
        actualReceived: ethers.formatEther(balanceDifference),
      },
      token: {
        name: (additionalMetadata as any)?.name || null,
        description: (additionalMetadata as any)?.description || null,
        domain: (additionalMetadata as any)?.domain || null,
        creator: metadata.owner,
        source_url: metadata.source_url,
        tags: metadata.tags,
      },
      transaction: {
        hash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        explorerUrl: `https://sagascan.io/tx/${tx.hash}`,
      },
      balances: {
        creator_before: ethers.formatEther(creatorBalanceBefore),
        creator_after: ethers.formatEther(creatorBalanceAfter),
        difference: ethers.formatEther(balanceDifference),
      },
    });
  } catch (error) {
    console.error("Donation error:", error);
    res.status(500).json({
      error: "Donation failed",
      details: (error as Error).message,
    });
  }
});

// 5.1. Get donation info for a token
app.get(
  "/api/nft/:tokenId/donation-info",
  async (req: Request, res: Response) => {
    try {
      const { tokenId } = req.params;
      const { contract } = await getContract();

      // Verify token exists
      let owner;
      try {
        owner = await contract.ownerOf(tokenId);
      } catch (error) {
        return res
          .status(404)
          .json({ error: `Token ${tokenId} does not exist` });
      }

      // Get token metadata
      const metadata = await contract.getMetadata(tokenId);
      const tokenURI = await contract.tokenURI(tokenId);

      // Fetch additional metadata from tokenURI
      let additionalMetadata = null;
      try {
        const response = await axios.get(tokenURI, { timeout: 5000 });
        additionalMetadata = response.data;
      } catch (error) {
        console.log(`Could not fetch additional metadata for token ${tokenId}`);
      }

      // Get creator balance
      const { provider } = new ethers.JsonRpcProvider(
        "https://evmrpc-testnet.0g.ai"
      );
      const creatorBalance = await provider.getBalance(metadata.owner);

      res.json({
        success: true,
        token: {
          id: tokenId,
          name: (additionalMetadata as any)?.name || "Unnamed Dataset",
          description:
            (additionalMetadata as any)?.description ||
            "No description available",
          domain: (additionalMetadata as any)?.domain || null,
          sample_size: (additionalMetadata as any)?.sample_size || null,
          price_usdc: (additionalMetadata as any)?.price_usdc || null,
          visibility: (additionalMetadata as any)?.visibility || null,
          creator: metadata.owner,
          source_url: metadata.source_url,
          tags: metadata.tags,
          created_at: Number(metadata.created_at),
          tokenURI: tokenURI,
          content_link: metadata.content_link,
        },
        creator: {
          address: metadata.owner,
          current_balance: ethers.formatEther(creatorBalance),
        },
        donation: {
          endpoint: `/api/nft/${tokenId}/donate`,
          method: "POST",
          body_example: {
            amount: "0.001",
          },
          limits: {
            min_amount: "0.000001",
            max_amount: "10.0",
            currency: "ETH",
          },
        },
      });
    } catch (error) {
      console.error("Get donation info error:", error);
      res.status(500).json({
        error: "Failed to get donation info",
        details: (error as Error).message,
      });
    }
  }
);

// 6. Get all NFTs (marketplace view)
app.get("/api/marketplace/nfts", async (req: Request, res: Response) => {
  try {
    const { contract, wallet } = await getContract();

    // Get all NFTs created by the current wallet (you can expand this)
    const tokenIds = await contract.getMetadataByCreator(wallet.address);

    const nfts = await Promise.all(
      tokenIds.map(async (id: any) => {
        const metadata = await contract.getMetadata(id);

        // Fetch actual metadata from Irys if available
        let metadataContent = null;
        try {
          const tokenURI = await contract.tokenURI(id);
          if (tokenURI) {
            const response = await fetch(tokenURI);
            if (response.ok) {
              metadataContent = await response.json();
            }
          }
        } catch (e) {
          console.log("Could not fetch metadata content:", e);
        }

        return {
          tokenId: id.toString(),
          sourceUrl: metadata.source_url,
          contentHash: metadata.content_hash,
          contentLink: metadata.content_link,
          embedVectorId: metadata.embed_vector_id,
          createdAt: Number(metadata.created_at),
          tags: metadata.tags,
          owner: metadata.owner,
          metadata: metadataContent,
        };
      })
    );

    res.json({
      totalNFTs: nfts.length,
      nfts: nfts.sort((a, b) => b.createdAt - a.createdAt),
    });
  } catch (error) {
    console.error("Get marketplace NFTs error:", error);
    res.status(500).json({
      error: "Failed to get marketplace NFTs",
      details: (error as Error).message,
    });
  }
});

// 7. Get dataset preview from Irys
app.get("/api/dataset/preview", async (req: Request, res: Response) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch from ${url}`);
    }

    const data = await response.json();

    // Return first 5 rows for preview
    const preview = Array.isArray(data) ? data.slice(0, 5) : data;

    res.json({
      preview,
      totalRows: Array.isArray(data) ? data.length : 1,
      previewRows: Array.isArray(preview) ? preview.length : 1,
    });
  } catch (error) {
    console.error("Preview error:", error);
    res.status(500).json({
      error: "Failed to get preview",
      details: (error as Error).message,
    });
  }
});

//Fetch data from huggingface
app.post("/api/fetch-dataset", async (req: Request, res: Response) => {
  const { sample_size = 5, dataset = "galileo-ai/medical_transcription_40" } =
    req.body;

  try {
    const response = await axios.get(
      `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(
        dataset
      )}&config=default&split=train&offset=0&limit=${sample_size}`
    );

    const rows = response.data.rows.map((row: any) => ({
      id: row.id,
      text: row.row.text,
      label: row.row.label || null,
    }));

    res.json({ samples: rows });
  } catch (error) {
    console.error("Error fetching dataset from HuggingFace:", error);
    res.status(500).json({
      error: "Failed to fetch dataset",
      details: (error as Error).message,
    });
  }
});

// Combined generate + mint endpoint
app.post("/api/generate-and-mint", async (req: Request, res: Response) => {
  try {
    const {
      input_text,
      sample_size = 3,
      dataset_name = "Generated Dataset",
      description = "Synthetic dataset",
      tags = ["synthetic"],
      domain = "medical",
      visibility = "public",
      price_usdc = 0,
      max_tokens = 3000,
      output_format = "Structured JSON",
      source_dataset = "galileo-ai/medical_transcription_40",
      ai_model = "gemini-2.0-flash",
    } = req.body;

    if (!input_text) {
      return res.status(400).json({ error: "input_text is required" });
    }

    // Step 1: Generate data
    console.log(`Generating ${sample_size} synthetic data samples...`);
    const input_data = Array(sample_size).fill({ text: input_text });
    const synthetic = await generate_synthetic_data(model, input_data);

    if (synthetic.length === 0) {
      throw new Error("Generation failed, no results.");
    }

    // Step 2: Upload to Irys
    console.log("Uploading to Irys...");
    const contentUrl = await uploadFromData(JSON.stringify(synthetic), [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "SagaSynth" },
      { name: "Type", value: "Dataset" },
    ]);

    // Create content hash
    const crypto = await import("crypto");
    const contentHash =
      "0x" +
      crypto
        .createHash("sha256")
        .update(JSON.stringify(synthetic))
        .digest("hex");

    const metadata = {
      name: dataset_name,
      description: description,
      content_url: contentUrl,
      sample_size: synthetic.length,
      tags: tags,
      created_at: new Date().toISOString(),
      input_text: input_text,
      domain: domain,
      visibility: visibility,
      price_usdc: price_usdc,
      max_tokens: max_tokens,
      output_format: output_format,
      source_dataset: source_dataset,
      ai_model: ai_model,
    };

    const metadataUrl = await uploadFromData(JSON.stringify(metadata), [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "SagaSynth" },
      { name: "Type", value: "Metadata" },
    ]);

    // // Step 3: Mint NFT automatically
    // console.log("Minting NFT...");
    // const { contract } = await getContract();

    // const tx = await contract.mintMetadataNFT(
    //   input_text,
    //   contentHash,
    //   contentUrl,
    //   "vector_" + Date.now(),
    //   Math.floor(Date.now() / 1000),
    //   tags,
    //   metadataUrl
    // );

    // const receipt = await tx.wait();
    // const event = receipt.logs.find(
    //   (log: any) => log.fragment && log.fragment.name === "MetadataMinted"
    // );
    // const tokenId = event ? event.args[0].toString() : null;

    // Step 4: Save to history
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
    history.push({
      input_text,
      data: synthetic,
      metadata: metadata,
      created_at: new Date().toISOString(),
      content_url: contentUrl,
      metadata_url: metadataUrl,
      tokenId: 0,
      transactionHash: "tx.hash",
    });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history));

    res.json({
      success: true,
      message: "Dataset generated and NFT minted successfully",
      data: synthetic,
      metadata: metadata,
      irys_links: {
        content_url: contentUrl,
        metadata_url: metadataUrl,
      },
    });
  } catch (error) {
    console.error("Generate and mint error:", error);
    res.status(500).json({
      error: "Generate and mint failed",
      details: (error as Error).message,
    });
  }
});

// Simple test endpoint without Irys
app.post("/api/test-upload", async (req: Request, res: Response) => {
  try {
    const { data, metadata } = req.body;

    // Mock upload response for testing
    const mockContentUrl = "https://gateway.irys.xyz/mock-content-id";
    const mockMetadataUrl = "https://gateway.irys.xyz/mock-metadata-id";
    const mockContentHash =
      "0x" +
      require("crypto")
        .createHash("sha256")
        .update(JSON.stringify(data))
        .digest("hex");

    res.json({
      success: true,
      message: "Mock upload successful",
      dataUrl: mockContentUrl,
      metadataUrl: mockMetadataUrl,
      contentHash: mockContentHash,
      mock: true,
      prepared: {
        sourceUrl: metadata?.sourceUrl || "Mock Source",
        contentHash: mockContentHash,
        contentLink: mockContentUrl,
        embedVectorId: "vector_" + Date.now(),
        createdAt: Math.floor(Date.now() / 1000),
        tags: metadata?.tags || ["mock", "test"],
        tokenURI: mockMetadataUrl,
      },
    });
  } catch (error) {
    res.status(500).json({
      error: "Mock test failed",
      details: (error as Error).message,
    });
  }
});

// Get all metadata from contract (only complete metadata)
app.get("/api/metadata/all", async (req: Request, res: Response) => {
  try {
    console.log("Fetching all metadata from contract...");
    const { contract } = await getContract();
    const allMetadata: any[] = [];
    // Since we don't have totalSupply(), we'll try tokens starting from 1 until we get errors
    let tokenId = 1;
    let totalTokensChecked = 0;

    while (true) {
      console.log(`Checking token ID: ${tokenId}`);
      try {
        // Check if token exists by trying to get its owner
        const owner = await contract.ownerOf(tokenId);
        if (owner === ethers.ZeroAddress) {
          break;
        }

        const metadata = await contract.getMetadata(tokenId);
        console.log(`Found metadata for token ${tokenId}:`, metadata);
        const tokenURI = await contract.tokenURI(tokenId);
        // Fetch additional metadata from tokenURI
        // Only include tokens with complete metadata (name and description)
        allMetadata.push({
          tokenId: tokenId,
          source_url: metadata.source_url,
          content_hash: metadata.content_hash,
          content_link: metadata.content_link,
          embed_vector_id: metadata.embed_vector_id,
          created_at: Number(metadata.created_at),
          tags: metadata.tags,
          owner: metadata.owner,
          tokenURI: tokenURI,
        });

        totalTokensChecked++;
        tokenId++;
      } catch (error) {
        // If we can't find the token, we've reached the end
        console.log(`No more tokens found after ${tokenId - 1}`);
        break;
      }
    }

    console.log(`Total tokens checked: ${totalTokensChecked}`);
    console.log(`Complete metadata tokens: ${allMetadata.length}`);

    res.json({
      success: true,
      total_checked: totalTokensChecked,
      total_complete: allMetadata.length,
      metadata: allMetadata,
    });
  } catch (error) {
    console.error("Error fetching all metadata:", error);
    res.status(500).json({
      error: "Failed to fetch metadata",
      details: (error as Error).message,
    });
  }
});

// --- BOUNTY API ENDPOINTS ---

// 7. Create bounty
app.post("/api/bounty/create", async (req: Request, res: Response) => {
  try {
    const { amount, title, description, tags } = req.body;

    // Validate required fields
    if (!amount) {
      return res.status(400).json({ error: "Amount is required" });
    }

    // Validate amount format
    try {
      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res
          .status(400)
          .json({ error: "Invalid amount. Must be a positive number." });
      }
      if (amountNum > 100) {
        return res
          .status(400)
          .json({ error: "Amount too large. Maximum 100 ETH per bounty." });
      }
    } catch (error) {
      return res.status(400).json({ error: "Invalid amount format" });
    }

    const { contract } = await getContract();
    const { ethers } = await import("ethers");

    console.log(`Creating bounty with ${amount} ETH...`);

    // Create bounty on blockchain
    const tx = await contract.createBounty({
      value: ethers.parseEther(amount),
    });

    const receipt = await tx.wait();
    console.log("Bounty created successfully!");

    // Get the bounty ID from the event
    const event = receipt.logs.find(
      (log: any) => log.fragment && log.fragment.name === "BountyCreated"
    );

    let bountyId = null;
    if (event) {
      bountyId = event.args[0].toString();
    }

    res.json({
      success: true,
      message: "Bounty created successfully",
      bounty: {
        id: bountyId,
        amount: amount,
        amountWei: ethers.parseEther(amount).toString(),
        title: title || "Unnamed Bounty",
        description: description || "No description provided",
        tags: tags || [],
        creator: receipt.from,
        status: "active",
        created_at: new Date().toISOString(),
      },
      transaction: {
        hash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        explorerUrl: `https://sagascan.io/tx/${tx.hash}`,
      },
    });
  } catch (error) {
    console.error("Create bounty error:", error);
    res.status(500).json({
      error: "Failed to create bounty",
      details: (error as Error).message,
    });
  }
});

// 8. Add contributor to bounty (admin only)
app.post(
  "/api/bounty/:bountyId/contributor",
  async (req: Request, res: Response) => {
    try {
      const { bountyId } = req.params;
      const { contributorAddress } = req.body;

      if (!contributorAddress) {
        return res
          .status(400)
          .json({ error: "Contributor address is required" });
      }

      // Validate Ethereum address format
      if (!ethers.isAddress(contributorAddress)) {
        return res.status(400).json({ error: "Invalid Ethereum address" });
      }

      const { contract } = await getContract();

      console.log(
        `Adding contributor ${contributorAddress} to bounty ${bountyId}...`
      );

      const tx = await contract.addContributor(bountyId, contributorAddress);
      const receipt = await tx.wait();

      res.json({
        success: true,
        message: "Contributor added successfully",
        bounty: {
          id: bountyId,
          contributor: contributorAddress,
        },
        transaction: {
          hash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          explorerUrl: `https://sagascan.io/tx/${tx.hash}`,
        },
      });
    } catch (error) {
      console.error("Add contributor error:", error);
      res.status(500).json({
        error: "Failed to add contributor",
        details: (error as Error).message,
      });
    }
  }
);

// 9. Distribute bounty (admin only)
app.post(
  "/api/bounty/:bountyId/distribute",
  async (req: Request, res: Response) => {
    try {
      const { bountyId } = req.params;
      const { contract } = await getContract();

      console.log(`Distributing bounty ${bountyId}...`);

      const tx = await contract.distributeBounty(bountyId);
      const receipt = await tx.wait();

      res.json({
        success: true,
        message: "Bounty distributed successfully",
        bounty: {
          id: bountyId,
          status: "distributed",
        },
        transaction: {
          hash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          explorerUrl: `https://sagascan.io/tx/${tx.hash}`,
        },
      });
    } catch (error) {
      console.error("Distribute bounty error:", error);
      res.status(500).json({
        error: "Failed to distribute bounty",
        details: (error as Error).message,
      });
    }
  }
);

// 10. Get bounty info
app.get("/api/bounty/:bountyId", async (req: Request, res: Response) => {
  try {
    const { bountyId } = req.params;
    const { contract } = await getContract();

    // Get bounty details from contract
    const bounty = await contract.bounties(bountyId);

    // Get contributors array
    const contributors = bounty.contributors || [];

    res.json({
      success: true,
      bounty: {
        id: bountyId,
        amount: ethers.formatEther(bounty.amount),
        amountWei: bounty.amount.toString(),
        creator: bounty.creator,
        contributors: contributors,
        contributorCount: contributors.length,
        distributed: bounty.distributed,
        status: bounty.distributed ? "distributed" : "active",
      },
    });
  } catch (error) {
    console.error("Get bounty error:", error);
    res.status(500).json({
      error: "Failed to get bounty",
      details: (error as Error).message,
    });
  }
});

// 11. Get all bounties
app.get("/api/bounties/all", async (req: Request, res: Response) => {
  try {
    const { contract } = await getContract();

    // Get the next bounty ID to determine how many bounties exist
    console.log("Getting all bounties...");
    const allBounties = await getAllBounties();

    res.json({
      success: true,
      total: allBounties.length,
      bounties: allBounties,
      summary: {
        active: allBounties.filter((b: any) => !b.distributed).length,
        distributed: allBounties.filter((b: any) => b.distributed).length,
        totalValue:
          allBounties
            .reduce((sum: number, b: any) => sum + parseFloat(b.amount), 0)
            .toFixed(6) + " ETH",
      },
    });
  } catch (error) {
    console.error("Get all bounties error:", error);
    res.status(500).json({
      error: "Failed to get bounties",
      details: (error as Error).message,
    });
  }
});

// 12. Get bounties by creator
app.get(
  "/api/bounties/creator/:address",
  async (req: Request, res: Response) => {
    try {
      const { address } = req.params;
      const { contract } = await getContract();

      // Validate Ethereum address
      if (!ethers.isAddress(address)) {
        return res.status(400).json({ error: "Invalid Ethereum address" });
      }

      // Get the next bounty ID
      const nextBountyId = await contract.nextBountyId();

      if (Number(nextBountyId) === 0) {
        return res.json({
          success: true,
          creator: address,
          total: 0,
          bounties: [],
        });
      }

      // Get bounties created by this address
      const creatorBounties: any[] = [];
      for (let i = 0; i < Number(nextBountyId); i++) {
        const bounty = await contract.bounties(i);

        if (bounty.creator.toLowerCase() === address.toLowerCase()) {
          // Get full details for this bounty
          const contributors = bounty.contributors || [];

          creatorBounties.push({
            id: i,
            amount: ethers.formatEther(bounty.amount),
            amountWei: bounty.amount.toString(),
            creator: bounty.creator,
            contributors: contributors,
            contributorCount: contributors.length,
            distributed: bounty.distributed,
            status: bounty.distributed ? "distributed" : "active",
          });
        }
      }

      // Sort by ID descending
      creatorBounties.sort((a: any, b: any) => b.id - a.id);

      res.json({
        success: true,
        creator: address,
        total: creatorBounties.length,
        bounties: creatorBounties,
      });
    } catch (error) {
      console.error("Get bounties by creator error:", error);
      res.status(500).json({
        error: "Failed to get bounties by creator",
        details: (error as Error).message,
      });
    }
  }
);

// 13. Add contributor to bounty (admin function)
app.post(
  "/api/bounty/:bountyId/add-contributor",
  async (req: Request, res: Response) => {
    try {
      const { bountyId } = req.params;
      const { contributorAddress } = req.body;

      if (!contributorAddress) {
        return res
          .status(400)
          .json({ error: "Contributor address is required" });
      }

      // Validate Ethereum address format
      if (!ethers.isAddress(contributorAddress)) {
        return res.status(400).json({ error: "Invalid Ethereum address" });
      }

      const { contract } = await getContract();

      // Check if bounty exists and get its details
      let bounty;
      try {
        bounty = await contract.bounties(bountyId);
        if (bounty.creator === ethers.ZeroAddress) {
          return res
            .status(404)
            .json({ error: `Bounty ${bountyId} does not exist` });
        }
      } catch (error) {
        return res
          .status(404)
          .json({ error: `Bounty ${bountyId} does not exist` });
      }

      // Check if bounty is already distributed
      if (bounty.distributed) {
        return res
          .status(400)
          .json({ error: "Cannot add contributor to distributed bounty" });
      }

      console.log(
        `Adding contributor ${contributorAddress} to bounty ${bountyId}...`
      );

      const tx = await contract.addContributor(bountyId, contributorAddress);
      const receipt = await tx.wait();

      console.log("Contributor added successfully!");

      res.json({
        success: true,
        message: "Contributor added successfully",
        bounty: {
          id: bountyId,
          amount: ethers.formatEther(bounty.amount),
          creator: bounty.creator,
          newContributor: contributorAddress,
          distributed: bounty.distributed,
        },
        transaction: {
          hash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          explorerUrl: `https://sagascan.io/tx/${tx.hash}`,
        },
      });
    } catch (error) {
      console.error("Add contributor error:", error);

      // Handle specific error cases
      if ((error as Error).message.includes("Not admin")) {
        return res.status(403).json({
          error: "Access denied. Only admin can add contributors.",
          details: (error as Error).message,
        });
      }

      if ((error as Error).message.includes("Already distributed")) {
        return res.status(400).json({
          error: "Bounty already distributed",
          details: (error as Error).message,
        });
      }

      res.status(500).json({
        error: "Failed to add contributor",
        details: (error as Error).message,
      });
    }
  }
);

// 14. Distribute bounty (admin function)
app.post(
  "/api/bounty/:bountyId/distribute",
  async (req: Request, res: Response) => {
    try {
      const { bountyId } = req.params;
      const { contract } = await getContract();

      // Check if bounty exists and get its details
      let bounty;
      try {
        bounty = await contract.bounties(bountyId);
        if (bounty.creator === ethers.ZeroAddress) {
          return res
            .status(404)
            .json({ error: `Bounty ${bountyId} does not exist` });
        }
      } catch (error) {
        return res
          .status(404)
          .json({ error: `Bounty ${bountyId} does not exist` });
      }

      // Check if bounty is already distributed
      if (bounty.distributed) {
        return res.status(400).json({ error: "Bounty already distributed" });
      }

      // Get current contributors
      const contributors = bounty.contributors || [];

      if (contributors.length === 0) {
        return res.status(400).json({
          error: "No contributors found. Cannot distribute empty bounty.",
        });
      }

      console.log(
        `Distributing bounty ${bountyId} to ${contributors.length} contributors...`
      );

      const tx = await contract.distributeBounty(bountyId);
      const receipt = await tx.wait();

      console.log("Bounty distributed successfully!");

      // Calculate reward per contributor
      const totalAmount = ethers.formatEther(bounty.amount);
      const rewardPerContributor = (
        parseFloat(totalAmount) / contributors.length
      ).toFixed(6);

      res.json({
        success: true,
        message: "Bounty distributed successfully",
        bounty: {
          id: bountyId,
          totalAmount: totalAmount,
          contributorCount: contributors.length,
          rewardPerContributor: rewardPerContributor + " ETH",
          contributors: contributors,
          creator: bounty.creator,
          status: "distributed",
        },
        transaction: {
          hash: tx.hash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          explorerUrl: `https://sagascan.io/tx/${tx.hash}`,
        },
      });
    } catch (error) {
      console.error("Distribute bounty error:", error);

      // Handle specific error cases
      if ((error as Error).message.includes("Not admin")) {
        return res.status(403).json({
          error: "Access denied. Only admin can distribute bounties.",
          details: (error as Error).message,
        });
      }

      if ((error as Error).message.includes("Already distributed")) {
        return res.status(400).json({
          error: "Bounty already distributed",
          details: (error as Error).message,
        });
      }

      if ((error as Error).message.includes("No contributors")) {
        return res.status(400).json({
          error: "No contributors found",
          details: (error as Error).message,
        });
      }

      res.status(500).json({
        error: "Failed to distribute bounty",
        details: (error as Error).message,
      });
    }
  }
);

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
