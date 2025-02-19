const express = require('express');
const axios = require('axios');
const app = express();
const port = 3000;
const workflow = require('./flux_schnell.json');

// Middleware to parse JSON request bodies
app.use(express.json());

// Endpoint to handle image generation requests
app.post('/generate-image', async (req, res) => {
 const { width, height, prompt } = req.body;

 if (!width || !height || !prompt) {
   return res.status(400).json({ error: 'Width, height, and prompt are required.' });
 }

 try {
   // Define the workflow for image generation

   // Send the workflow to ComfyUI's /prompt endpoint
   workflow["6"].inputs.text = prompt
   workflow["27"].inputs.width = width
   workflow["27"].inputs.height = height
   workflow["31"].inputs.seed = Math.floor(Math.random() * 1000000000000000)

   const response = await axios.post('http://192.168.10.226:8188/prompt', {"prompt": workflow});

   // Check if the response contains the prompt ID
   if (response.data && response.data.prompt_id) {
     const promptId = response.data.prompt_id;
     console.log(promptId)
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

     if (imageResponse.data[promptId] && imageResponse.data[promptId].outputs) {
       const imageUrl = imageResponse.data[promptId].outputs["9"].images[0].filename
        console.log(imageUrl)
       // Fetch the generated image
       const imageResult = await axios.get(`http://192.168.10.226:8188/view?filename=${imageUrl}`, {
         responseType: 'arraybuffer',
       });

       // Set the appropriate headers and send the image
       res.set('Content-Type', 'image/png');
       return res.send(imageResult.data);
     } else {
       return res.status(500).json({ error: 'Image generation timed out.' });
     }
   } else {
     return res.status(500).json({ error: 'Failed to initiate image generation.' });
   }
 } catch (error) {
   console.error('Error generating image:', error.message);
   return res.status(500).json({ error: 'An error occurred during image generation.' });
 }
});

app.listen(port, () => {
 console.log(`Server is running on http://localhost:${port}`);
});