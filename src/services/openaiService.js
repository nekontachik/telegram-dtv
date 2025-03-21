/**
 * OpenAI service module
 * Handles all interactions with OpenAI API
 */

import OpenAI from 'openai';
import { config } from '../config/config.js';

class OpenAIService {
  constructor() {
    this.client = new OpenAI({ apiKey: config.openai.apiKey });
    this.assistantId = config.openai.assistantId;
  }

  /**
   * Validates the OpenAI API key
   * @returns {Promise<boolean>} - True if the key is valid
   */
  async validateApiKey() {
    try {
      // Simple API call to test the key
      await this.client.models.list({ limit: 1 });
      console.log("OpenAI API key is valid.");
      return true;
    } catch (error) {
      console.error("Error validating OpenAI API key:", error.message);
      console.error("Please check your .env file and update the OPENAI_API_KEY value.");
      console.error("Make sure you're using a valid API key from https://platform.openai.com/api-keys");
      return false;
    }
  }

  /**
   * Creates or retrieves an assistant
   * @returns {Promise<string>} - The assistant ID
   */
  async createOrGetAssistant() {
    if (this.assistantId) {
      try {
        // Try to retrieve the existing assistant
        const assistant = await this.client.beta.assistants.retrieve(this.assistantId);
        console.log("Using existing assistant:", assistant.id);
        return assistant.id;
      } catch (error) {
        console.error("Error retrieving assistant:", error.message);
        console.log("Will create a new assistant instead.");
        this.assistantId = null;
      }
    }

    try {
      // Create a new assistant
      const assistant = await this.client.beta.assistants.create({
        name: "Telegram Bot Assistant",
        instructions: "You are a helpful assistant that responds to user queries via Telegram.",
        model: config.openai.model,
      });
      
      console.log("Created new assistant:", assistant.id);
      this.assistantId = assistant.id;
      return assistant.id;
    } catch (error) {
      console.error("Error creating assistant:", error);
      throw error;
    }
  }

  /**
   * Creates a new thread
   * @returns {Promise<string>} - The thread ID
   */
  async createThread() {
    try {
      const thread = await this.client.beta.threads.create();
      return thread.id;
    } catch (error) {
      console.error("Error creating thread:", error);
      throw error;
    }
  }

  /**
   * Adds a message to a thread
   * @param {string} threadId - Thread ID
   * @param {string} content - Message content
   */
  async addMessageToThread(threadId, content) {
    return this.client.beta.threads.messages.create(
      threadId,
      {
        role: "user",
        content
      }
    );
  }

  /**
   * Runs the assistant on a thread and returns the response
   * @param {string} threadId - Thread ID
   * @returns {Promise<string>} - Assistant's response
   */
  async runAssistantAndGetResponse(threadId) {
    // Create and poll for the run to complete
    const run = await this.client.beta.threads.runs.createAndPoll(
      threadId, 
      { assistant_id: this.assistantId }
    );
    
    console.log("Run completed:", run.status);
    
    // Get the latest messages from the thread
    const messages = await this.client.beta.threads.messages.list(
      threadId,
      { order: "desc", limit: 1 }
    );
    
    // Extract the assistant's response
    if (messages.data.length > 0) {
      const assistantMessage = messages.data[0];
      if (assistantMessage.role === "assistant") {
        let assistantResponse = "";
        
        // Extract text content from the message
        for (const content of assistantMessage.content) {
          if (content.type === "text") {
            assistantResponse += content.text.value;
          }
        }
        
        return assistantResponse;
      }
    }
    
    return null;
  }
}

export const openaiService = new OpenAIService();
