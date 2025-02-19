"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const axios_1 = __importDefault(require("axios"));
const sharp_1 = __importDefault(require("sharp"));
const form_data_1 = __importDefault(require("form-data"));
const app = (0, express_1.default)();
const port = 3000;
const workflow = require('./flux_schnell.json');
// Middleware to parse JSON request bodies
app.use(express_1.default.json());
async function uploadToEncorp(imageBuffer, filename, article, cookie) {
    // Prepare form data
    const form = new form_data_1.default();
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
        const uploadResponse = await axios_1.default.post(uploadURL, form, { headers });
        return uploadResponse.data;
    }
    catch (error) {
        console.error('Error uploading to Encorp:', error);
        throw error;
    }
}
// Endpoint to handle image generation requests
app.post('/generate-image', async (req, res) => {
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
        const response = await axios_1.default.post('http://192.168.10.226:8188/prompt', { "prompt": workflow });
        if (response.data && response.data.prompt_id) {
            const promptId = response.data.prompt_id;
            console.log(promptId);
            let imageResponse;
            const maxAttempts = 60;
            let attempts = 0;
            while (attempts < maxAttempts) {
                imageResponse = await axios_1.default.get(`http://192.168.10.226:8188/history/${promptId}`);
                if (imageResponse.data[promptId] && imageResponse.data[promptId].outputs) {
                    break;
                }
                attempts++;
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            if (imageResponse?.data[promptId] && imageResponse?.data[promptId].outputs) {
                const imageUrl = imageResponse?.data[promptId].outputs["9"].images[0].filename;
                console.log(imageUrl);
                const imageResult = await axios_1.default.get(`http://192.168.10.226:8188/view?filename=${imageUrl}`, {
                    responseType: 'arraybuffer',
                });
                const compressedImage = await (0, sharp_1.default)(imageResult.data)
                    .png({ quality: 80, compressionLevel: 9 })
                    .toBuffer();
                // Send image directly
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
// New endpoint to generate and upload image
app.post('/generate-and-upload', async (req, res) => {
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
        const response = await axios_1.default.post('http://192.168.10.226:8188/prompt', { "prompt": workflow });
        if (response.data && response.data.prompt_id) {
            const promptId = response.data.prompt_id;
            console.log(promptId);
            let imageResponse;
            const maxAttempts = 60;
            let attempts = 0;
            while (attempts < maxAttempts) {
                imageResponse = await axios_1.default.get(`http://192.168.10.226:8188/history/${promptId}`);
                if (imageResponse.data[promptId] && imageResponse.data[promptId].outputs) {
                    break;
                }
                attempts++;
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
            if (imageResponse?.data[promptId] && imageResponse?.data[promptId].outputs) {
                const imageUrl = imageResponse?.data[promptId].outputs["9"].images[0].filename;
                console.log(imageUrl);
                const imageResult = await axios_1.default.get(`http://192.168.10.226:8188/view?filename=${imageUrl}`, {
                    responseType: 'arraybuffer',
                });
                const compressedImage = await (0, sharp_1.default)(imageResult.data)
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
                }
                catch (uploadError) {
                    return res.status(500).json({
                        error: 'Failed to upload to Encorp',
                        details: uploadError
                    });
                }
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
