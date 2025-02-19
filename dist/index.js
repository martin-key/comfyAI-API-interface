"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const sharp_1 = __importDefault(require("sharp"));
const app = (0, express_1.default)();
const port = 3000;
const workflow = require('./flux_schnell.json');
// Middleware to parse JSON request bodies
app.use(express_1.default.json());
// Endpoint to handle image generation requests
app.post('/generate-image', async (req, res) => {
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
        const response = await axios_1.default.post('http://192.168.10.226:8188/prompt', { "prompt": workflow });
        // Check if the response contains the prompt ID
        if (response.data && response.data.prompt_id) {
            const promptId = response.data.prompt_id;
            console.log(promptId);
            // Poll the /history endpoint to check if the image is ready
            let imageResponse;
            const maxAttempts = 60;
            let attempts = 0;
            while (attempts < maxAttempts) {
                imageResponse = await axios_1.default.get(`http://192.168.10.226:8188/history/${promptId}`);
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
                const imageResult = await axios_1.default.get(`http://192.168.10.226:8188/view?filename=${imageUrl}`, {
                    responseType: 'arraybuffer',
                });
                // Compress the image using Sharp
                const compressedImage = await (0, sharp_1.default)(imageResult.data)
                    .png({ quality: 80, compressionLevel: 9 }) // Adjust quality and compression level as needed
                    .toBuffer();
                // Set the appropriate headers
                res.set('Content-Type', 'image/png');
                return res.send(compressedImage);
            }
            else {
                return res.status(500).json({ error: 'Image generation timed out.' });
            }
        }
        else {
            return res.status(500).json({ error: 'Failed to initiate image generation.' });
        }
    }
    catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: 'An error occurred.' });
    }
});
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
