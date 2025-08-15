import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import * as dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || ""; // Replace with your deployed contract address

async function main() {
  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) {
    console.error("Please set your PRIVATE_KEY in the .env file");
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider("https://evmrpc-testnet.0g.ai");
  const wallet = new ethers.Wallet(privateKey, provider);

  const artifactsPath = path.join(
    __dirname,
    "../artifacts/contracts/Contract.sol/CrawlRegistry.json"
  );
  const contractArtifact = JSON.parse(fs.readFileSync(artifactsPath, "utf8"));

  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    contractArtifact.abi,
    wallet
  );

  const allMetadata = [];

  // Since we don't have totalSupply(), we'll try tokens starting from 1 until we get errors
  let tokenId = 1;
  let foundTokens = 0;

  console.log("Fetching all metadata...");

  while (true) {
    try {
      // Check if token exists by trying to get its owner
      const owner = await contract.ownerOf(tokenId);
      if (owner === ethers.ZeroAddress) {
        break;
      }

      const metadata = await contract.getMetadata(tokenId);
      const tokenURI = await contract.tokenURI(tokenId);

      // Fetch additional metadata from tokenURI
      let additionalMetadata = null;
      try {
        const response = await axios.get(tokenURI, { timeout: 5000 });
        additionalMetadata = response.data;
      } catch (error) {
        console.log(
          `Could not fetch additional metadata for token ${tokenId}:`,
          (error as Error).message
        );
      }

      // Only include tokens with complete metadata (name and description)
      if (
        additionalMetadata &&
        additionalMetadata.name &&
        additionalMetadata.description
      ) {
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
          // Additional metadata from tokenURI
          name: additionalMetadata.name,
          description: additionalMetadata.description,
          domain: additionalMetadata.domain || null,
          visibility: additionalMetadata.visibility || null,
          price_usdc: additionalMetadata.price_usdc || null,
          sample_size: additionalMetadata.sample_size || null,
          ai_model: additionalMetadata.ai_model || null,
          input_text: additionalMetadata.input_text || null,
          output_format: additionalMetadata.output_format || null,
          source_dataset: additionalMetadata.source_dataset || null,
          max_tokens: additionalMetadata.max_tokens || null,
          full_metadata: additionalMetadata,
        });

        console.log(`✅ Token ${tokenId}: "${additionalMetadata.name}"`);
      } else {
        console.log(`⏭️  Token ${tokenId}: Skipped (incomplete metadata)`);
      }

      foundTokens++;
      tokenId++;
    } catch (error) {
      // If we can't find the token, we've reached the end
      console.log(`No more tokens found after ${tokenId - 1}`);
      break;
    }
  }

  console.log(`\nTotal tokens checked: ${foundTokens}`);
  console.log(`Complete metadata tokens: ${allMetadata.length}`);
  console.log(JSON.stringify(allMetadata, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
