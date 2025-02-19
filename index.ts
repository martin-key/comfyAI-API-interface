import express, { Request, Response } from 'express';
import axios from 'axios';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sharp from 'sharp';
import FormData from 'form-data';

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

async function uploadToEncorp(imageBuffer: Buffer, filename: string, article: string, cookie: string) {
    // Prepare form data
    const form = new FormData();
    form.append('image', imageBuffer, filename);

    // Construct the upload URL
    const uploadURL = `https://encorp.io/api/v1/articles/image-upload?article=${encodeURIComponent(article)}`;

    // Prepare headers
    const headers = {
        ...form.getHeaders(),
        'Cookie': cookie,
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br'
    };

    try {
        const uploadResponse = await axios.post(uploadURL, form, { headers });
        return uploadResponse.data;
    } catch (error) {
        console.error('Error uploading to Encorp:', error);
        throw error;
    }
}

// Endpoint to handle image generation requests
app.post('/generate-image', async (req: Request, res: Response) => {
    const { width, height, prompt } = req.body;

    if (!width || !height || !prompt) {
        return res.status(400).json({ error: 'Width, height, and prompt are required.' });
    }

    try {
        // Define the workflow for image generation
        workflow["6"].inputs.text = prompt;
        workflow["27"].inputs.width = width;
        workflow["27"].inputs.height = height;
        workflow["31"].inputs.seed = Math.floor(Math.random() * 1000000000000000);

        const response = await axios.post('http://192.168.10.226:8188/prompt', { "prompt": workflow });

        if (response.data && response.data.prompt_id) {
            const promptId = response.data.prompt_id;
            console.log(promptId);
            
            let imageResponse;
            const maxAttempts = 60;
            let attempts = 0;

            while (attempts < maxAttempts) {
                imageResponse = await axios.get(`http://192.168.10.226:8188/history/${promptId}`);
                if (imageResponse.data[promptId] && imageResponse.data[promptId].outputs) {
                    break;
                }
                attempts++;
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            if (imageResponse?.data[promptId] && imageResponse?.data[promptId].outputs) {
                const imageUrl = imageResponse?.data[promptId].outputs["9"].images[0].filename;
                console.log(imageUrl);
                
                const imageResult = await axios.get(`http://192.168.10.226:8188/view?filename=${imageUrl}`, {
                    responseType: 'arraybuffer',
                });

                const compressedImage = await sharp(imageResult.data)
                    .png({ quality: 80, compressionLevel: 9 })
                    .toBuffer();

                // Send image directly
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

// New endpoint to generate and upload image
app.post('/generate-and-upload', async (req: Request, res: Response) => {
    const { width, height, prompt, article, cookie } = req.body;

    if (!width || !height || !prompt || !article || !cookie) {
        return res.status(400).json({ 
            error: 'Width, height, prompt, article, and cookie are required.' 
        });
    }

    try {
        // Define the workflow for image generation
        workflow["6"].inputs.text = prompt;
        workflow["27"].inputs.width = width;
        workflow["27"].inputs.height = height;
        workflow["31"].inputs.seed = Math.floor(Math.random() * 1000000000000000);

        const response = await axios.post('http://192.168.10.226:8188/prompt', { "prompt": workflow });

        if (response.data && response.data.prompt_id) {
            const promptId = response.data.prompt_id;
            console.log(promptId);
            
            let imageResponse;
            const maxAttempts = 60;
            let attempts = 0;

            while (attempts < maxAttempts) {
                imageResponse = await axios.get(`http://192.168.10.226:8188/history/${promptId}`);
                if (imageResponse.data[promptId] && imageResponse.data[promptId].outputs) {
                    break;
                }
                attempts++;
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }

            if (imageResponse?.data[promptId] && imageResponse?.data[promptId].outputs) {
                const imageUrl = imageResponse?.data[promptId].outputs["9"].images[0].filename;
                console.log(imageUrl);
                
                const imageResult = await axios.get(`http://192.168.10.226:8188/view?filename=${imageUrl}`, {
                    responseType: 'arraybuffer',
                });

                const compressedImage = await sharp(imageResult.data)
                    .png({ quality: 80, compressionLevel: 9 })
                    .toBuffer();

                // Generate filename
                const sanitizedPrompt = promptId.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `${sanitizedPrompt}_${timestamp}.png`;

                try {
                    const uploadResult = await uploadToEncorp(compressedImage, filename, article, cookie);
                    return res.json({
                        status: 'success',
                        data: uploadResult
                    });
                } catch (uploadError) {
                    return res.status(500).json({ 
                        error: 'Failed to upload to Encorp',
                        details: uploadError
                    });
                }
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