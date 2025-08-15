import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { Uploader } from "@irys/upload";
import { Ethereum } from "@irys/upload-ethereum";
import "dotenv/config";

dotenv.config();

async function getIrys() {
  const rpcUrl = process.env.INFURA_RPC || "";
  const uploader = await Uploader(Ethereum)
    .withWallet(process.env.PRIVATE_KEY_IRYS || "")
    .withRpc(rpcUrl)
    .devnet();

  console.log(`Connected to Irys with address: ${uploader.address}`);
  return uploader;
}

async function uploadFile(
  filePath: string,
  tags: Array<{ name: string; value: string }> = []
) {
  try {
    const uploader = await getIrys();

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Get file data
    const fileData = fs.readFileSync(filePath);
    const fileExtension = path.extname(filePath).substring(1);
    const fileName = path.basename(filePath);

    // Add default tags
    const allTags = [
      { name: "Content-Type", value: getMimeType(fileExtension) },
      { name: "App-Name", value: "CrawlRegistry" },
      { name: "File-Name", value: fileName },
      { name: "Timestamp", value: Date.now().toString() },
      ...tags,
    ];

    // Get the cost to upload
    const price = await uploader.getPrice(fileData.length);
    console.log(`Cost to upload: ${ethers.formatEther(price.toString())} ETH`);

    // Fund the upload if needed
    const balance = await uploader.getLoadedBalance();
    if (balance < price) {
      console.log("Funding upload...");
      const fundTx = await uploader.fund(price);
      console.log(`Funding successful: ${fundTx.id}`);
    }

    // Upload the file
    console.log(`Uploading file: ${fileName}`);
    const receipt = await uploader.upload(fileData, {
      tags: allTags,
    });

    console.log(`File uploaded successfully!`);
    console.log(`Transaction ID: ${receipt.id}`);
    console.log(`URL: https://gateway.irys.xyz/${receipt.id}`);

    return {
      id: receipt.id,
      url: `https://gateway.irys.xyz/${receipt.id}`,
    };
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
}

async function uploadMetadata(
  metadata: any,
  tags: Array<{ name: string; value: string }> = []
) {
  try {
    const uploader = await getIrys();

    // Convert metadata to JSON string
    const metadataStr = JSON.stringify(metadata);

    // Add default tags
    const allTags = [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "CrawlRegistry" },
      { name: "Type", value: "metadata" },
      { name: "Timestamp", value: Date.now().toString() },
      ...tags,
    ];

    // Get the cost to upload
    const price = await uploader.getPrice(metadataStr.length);
    console.log(
      `Cost to upload metadata: ${ethers.formatEther(price.toString())} ETH`
    );

    // Fund the upload if needed
    const balance = await uploader.getLoadedBalance();
    if (balance < price) {
      console.log("Funding upload...");
      const fundTx = await uploader.fund(price);
      console.log(`Funding successful: ${fundTx.id}`);
    }

    // Upload the metadata
    console.log("Uploading metadata...");
    const receipt = await uploader.upload(metadataStr, {
      tags: allTags,
    });

    console.log(`Metadata uploaded successfully!`);
    console.log(`Transaction ID: ${receipt.id}`);
    console.log(`URL: https://gateway.irys.xyz/${receipt.id}`);

    return {
      id: receipt.id,
      url: `https://gateway.irys.xyz/${receipt.id}`,
    };
  } catch (error) {
    console.error("Error uploading metadata:", error);
    throw error;
  }
}

function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    json: "application/json",
    txt: "text/plain",
    pdf: "application/pdf",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
  };

  return mimeTypes[extension.toLowerCase()] || "application/octet-stream";
}

// Main function to handle command line arguments
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log("Usage:");
    console.log(
      "  npm run upload:file <filePath> [tag1Name:tag1Value] [tag2Name:tag2Value] ..."
    );
    console.log("  npm run upload:metadata <jsonFilePath>");
    console.log("Examples:");
    console.log(
      '  npm run upload:file ./image.png source:website title:"My Image"'
    );
    console.log("  npm run upload:metadata ./metadata.json");
    return;
  }

  if (command === "file") {
    const filePath = args[1];
    if (!filePath) {
      console.error("File path is required");
      return;
    }

    // Parse tags from arguments
    const tags = args.slice(2).map((tagArg) => {
      const [name, value] = tagArg.split(":", 2);
      return { name, value };
    });

    await uploadFile(filePath, tags);
  } else if (command === "metadata") {
    const jsonFilePath = args[1];
    if (!jsonFilePath) {
      console.error("JSON file path is required");
      return;
    }

    // Read and parse the JSON file
    const metadata = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));

    // Parse tags from arguments
    const tags = args.slice(2).map((tagArg) => {
      const [name, value] = tagArg.split(":", 2);
      return { name, value };
    });

    await uploadMetadata(metadata, tags);
  } else {
    console.error(`Unknown command: ${command}`);
  }
}

// Run the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
