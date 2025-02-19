import express, { Request, Response } from 'express';
import axios from 'axios';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sharp from 'sharp';

const app = express();
const port = 3000;
const workflow = require('./flux_schnell.json');

// Middleware to parse JSON request bodies
app.use(express.json());

interface Workflow {
    "6": { inputs: { text: string; clip: any[] }; class_type: string; _meta: { title: string } };
    "8": { inputs: { samples: any[]; vae: any[] }; class_type: string; _meta: { title: string } };
    "9": { inputs: { filename_prefix: string; images: any[] }; class_type: string; _meta: { title: string } };
    "27": { inputs: { width: number; height: number; batch_size: number }; class_type: string; _meta: { title: string } };
    "30": { inputs: { ckpt_name: string }; class_type: string; _meta: { title: string } };
    "31": { inputs: { seed: number; steps: number; cfg: number; sampler_name: string; scheduler: string; denoise: number; model: any[]; positive: any[]; negative: any[]; latent_image: any[] }; class_type: string; _meta: { title: string } };
    "33": { inputs: { text: string; clip: any[] }; class_type: string; _meta: { title: string } };
}

// Endpoint to handle image generation requests
app.post('/generate-image', async (req: Request, res: Response) => {
    const { width, height, prompt } = req.body;

    if (!width || !height || !prompt) {
        return res.status(400).json({ error: 'Width, height, and prompt are required.' });
    }

    try {
        // Define the workflow for image generation

        // Send the workflow to ComfyUI's /prompt endpoint
        workflow["6"].inputs.text = prompt;
        workflow["27"].inputs.width = width;
        workflow["27"].inputs.height = height;
        workflow["31"].inputs.seed = Math.floor(Math.random() * 1000000000000000);

        const response = await axios.post('http://192.168.10.226:8188/prompt', { "prompt": workflow });

        // Check if the response contains the prompt ID
        if (response.data && response.data.prompt_id) {
            const promptId = response.data.prompt_id;
            console.log(promptId);
            // Poll the /history endpoint to check if the image is ready
            let imageResponse;
            const maxAttempts = 60;
            let attempts = 0;

            while (attempts < maxAttempts) {
                imageResponse = await axios.get(`http://192.168.10.226:8188/history/${promptId}`);
                if (imageResponse.data[promptId] && imageResponse.data[promptId].outputs) {
                    break;
                }
                attempts++;
                await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second before retrying
            }

            if (imageResponse?.data[promptId] && imageResponse?.data[promptId].outputs) {
                const imageUrl = imageResponse?.data[promptId].outputs["9"].images[0].filename;
                console.log(imageUrl);
                // Fetch the generated image
                const imageResult = await axios.get(`http://192.168.10.226:8188/view?filename=${imageUrl}`, {
                    responseType: 'arraybuffer',
                });

                // Compress the image using Sharp
                const compressedImage = await sharp(imageResult.data)
                    .png({ quality: 80, compressionLevel: 9 }) // Adjust quality and compression level as needed
                    .toBuffer();

                // Set the appropriate headers
                res.set('Content-Type', 'image/png');

                return res.send(compressedImage);
            } else {
                return res.status(500).json({ error: 'Image generation timed out.' });
            }
        } else {
            return res.status(500).json({ error: 'Failed to initiate image generation.' });
        }
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: 'An error occurred.' });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});