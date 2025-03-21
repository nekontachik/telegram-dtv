/**
 * OpenAI service module
 * Handles all interactions with OpenAI API
 */

import OpenAI from 'openai';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

class OpenAIService {
  constructor() {
    this.client = new OpenAI({ apiKey: config.openai.apiKey });
    // Use assistant ID from config
    this.assistantId = config.openai.assistantId;
    
    if (!this.assistantId) {
      throw new Error('OPENAI_ASSISTANT_ID is required');
    }
    
    logger.info('OpenAI Service initialized with assistant ID:', this.assistantId);
  }

  /**
   * Validates the OpenAI API key
   * @returns {Promise<boolean>} - True if the key is valid
   */
  async validateApiKey() {
    try {
      // Simple API call to test the key
      await this.client.models.list({ limit: 1 });
      logger.info("OpenAI API key is valid");
      return true;
    } catch (error) {
      logger.error("Error validating OpenAI API key:", error.message);
      return false;
    }
  }

  /**
   * Retrieves the Capy Concierge assistant
   * @returns {Promise<string>} - The assistant ID
   */
  async createOrGetAssistant() {
    try {
      // Try to retrieve the existing Capy Concierge assistant
      const assistant = await this.client.beta.assistants.retrieve(this.assistantId);
      logger.info("Connected to Capy Concierge assistant:", assistant.id);
      return assistant.id;
    } catch (error) {
      logger.error("Error retrieving Capy Concierge assistant:", error.message);
      throw new Error("Failed to connect to Capy Concierge assistant. Please check the assistant ID.");
    }
  }

  /**
   * Creates a new thread
   * @returns {Promise<string>} - The thread ID
   */
  async createThread() {
    try {
      const thread = await this.client.beta.threads.create();
      logger.info("Created new thread:", thread.id);
      return thread.id;
    } catch (error) {
      logger.error("Error creating thread:", error);
      throw error;
    }
  }

  /**
   * Adds a message to a thread
   * @param {string} threadId - Thread ID
   * @param {string} content - Message content
   */
  async addMessageToThread(threadId, content) {
    try {
      const message = await this.client.beta.threads.messages.create(
        threadId,
        {
          role: "user",
          content
        }
      );
      logger.info("Added message to thread", { threadId, messageId: message.id });
      return message;
    } catch (error) {
      logger.error("Error adding message to thread:", error);
      throw error;
    }
  }

  /**
   * Runs the assistant on a thread and returns the response
   * @param {string} threadId - Thread ID
   * @returns {Promise<string>} - Assistant's response
   */
  async runAssistantAndGetResponse(threadId) {
    try {
      // Create and poll for the run to complete
      const run = await this.client.beta.threads.runs.createAndPoll(
        threadId, 
        { assistant_id: this.assistantId }
      );
      
      logger.info("Run completed:", { threadId, status: run.status });
      
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
          
          logger.info("Got assistant response", { 
            threadId, 
            messageId: assistantMessage.id,
            length: assistantResponse.length 
          });
          return assistantResponse;
        }
      }
      
      logger.warn("No assistant response found", { threadId });
      return null;
    } catch (error) {
      logger.error("Error getting assistant response:", error);
      throw error;
    }
  }
}

export const openaiService = new OpenAIService();
