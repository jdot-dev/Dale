import { HfInference } from '@huggingface/inference';
import Debug from 'debug';

import type { SentimentResult } from '../base/types';

const debug = Debug('lobechat:scrapers:sentiment');

/**
 * Sentiment analysis configuration
 */
export interface SentimentConfig {
  /** Enable HuggingFace analysis */
  enableHuggingFace?: boolean;
  /** Enable OpenAI analysis */
  enableOpenAI?: boolean;
  /** Enable local model analysis */
  enableLocal?: boolean;
  /** HuggingFace model to use */
  huggingFaceModel?: string;
  /** HuggingFace API key */
  huggingFaceApiKey?: string;
  /** OpenAI API key */
  openAIApiKey?: string;
  /** Aggregation strategy */
  aggregationStrategy?: 'average' | 'majority' | 'weighted';
}

/**
 * Multi-provider sentiment analysis processor
 * 
 * Analyzes text sentiment using multiple AI providers:
 * - HuggingFace (default: cardiffnlp/twitter-roberta-base-sentiment)
 * - OpenAI (GPT-based sentiment analysis)
 * - Local models (fallback)
 */
export class SentimentProcessor {
  private readonly config: Required<SentimentConfig>;
  private hfClient?: HfInference;

  constructor(config: SentimentConfig = {}) {
    this.config = {
      enableHuggingFace: config.enableHuggingFace ?? true,
      enableOpenAI: config.enableOpenAI ?? false,
      enableLocal: config.enableLocal ?? false,
      huggingFaceModel:
        config.huggingFaceModel ||
        process.env.HUGGINGFACE_SENTIMENT_MODEL ||
        'cardiffnlp/twitter-roberta-base-sentiment-latest',
      huggingFaceApiKey: config.huggingFaceApiKey || process.env.HUGGINGFACE_API_KEY || '',
      openAIApiKey: config.openAIApiKey || process.env.OPENAI_API_KEY || '',
      aggregationStrategy: config.aggregationStrategy || 'weighted',
    };

    if (this.config.enableHuggingFace && this.config.huggingFaceApiKey) {
      this.hfClient = new HfInference(this.config.huggingFaceApiKey);
    }
  }

  /**
   * Analyze text sentiment using multiple providers
   */
  async analyze(text: string): Promise<SentimentResult> {
    const startTime = Date.now();

    if (!text || text.trim().length === 0) {
      throw new Error('Text is required for sentiment analysis');
    }

    // Truncate very long text
    const truncatedText = text.slice(0, 5000);

    const results: SentimentResult[] = [];

    // Run all enabled analyzers in parallel
    const promises: Promise<SentimentResult>[] = [];

    if (this.config.enableHuggingFace) {
      promises.push(this.analyzeWithHuggingFace(truncatedText));
    }

    if (this.config.enableOpenAI) {
      promises.push(this.analyzeWithOpenAI(truncatedText));
    }

    if (this.config.enableLocal) {
      promises.push(this.analyzeWithLocal(truncatedText));
    }

    // Wait for all analyses
    const settledResults = await Promise.allSettled(promises);

    // Collect successful results
    for (const result of settledResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        debug(`Analysis failed: ${result.reason}`);
      }
    }

    if (results.length === 0) {
      throw new Error('All sentiment analysis providers failed');
    }

    // Aggregate results
    const aggregated = this.aggregateResults(results);

    debug(`Sentiment analysis completed in ${Date.now() - startTime}ms`, {
      sentiment: aggregated.sentiment,
      score: aggregated.score,
      providers: results.length,
    });

    return aggregated;
  }

  /**
   * Analyze with HuggingFace
   */
  private async analyzeWithHuggingFace(text: string): Promise<SentimentResult> {
    if (!this.hfClient) {
      throw new Error('HuggingFace client not initialized');
    }

    const startTime = Date.now();

    try {
      const result = await this.hfClient.textClassification({
        model: this.config.huggingFaceModel,
        inputs: text,
      });

      // HuggingFace returns array of labels with scores
      const labels = Array.isArray(result) ? result : [result];

      // Map labels to our sentiment types
      const sentimentMap: Record<string, 'positive' | 'negative' | 'neutral'> = {
        positive: 'positive',
        pos: 'positive',
        label_2: 'positive',
        negative: 'negative',
        neg: 'negative',
        label_0: 'negative',
        neutral: 'neutral',
        label_1: 'neutral',
      };

      // Get the top result
      const topResult = labels[0];
      const sentiment = sentimentMap[topResult.label.toLowerCase()] || 'neutral';

      // Convert score to -1 to 1 scale
      let score = topResult.score;
      if (sentiment === 'negative') {
        score = -score;
      } else if (sentiment === 'neutral') {
        score = 0;
      }

      return {
        sentiment,
        score,
        confidence: topResult.score,
        model: `huggingface:${this.config.huggingFaceModel}`,
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(`HuggingFace analysis failed: ${(error as Error).message}`);
    }
  }

  /**
   * Analyze with OpenAI
   */
  private async analyzeWithOpenAI(text: string): Promise<SentimentResult> {
    if (!this.config.openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const startTime = Date.now();

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content:
                'You are a sentiment analysis expert. Analyze the sentiment and respond ONLY with a JSON object in this exact format: {"sentiment": "positive" or "negative" or "neutral", "score": number between -1 and 1, "confidence": number between 0 and 1, "emotions": {"joy": 0-1, "anger": 0-1, "sadness": 0-1, "fear": 0-1, "surprise": 0-1}}',
            },
            {
              role: 'user',
              content: `Analyze the sentiment of this text:\n\n${text}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 200,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices[0].message.content;

      // Parse JSON response
      const parsed = JSON.parse(content);

      return {
        sentiment: parsed.sentiment,
        score: parsed.score,
        confidence: parsed.confidence,
        emotions: parsed.emotions,
        model: 'openai:gpt-3.5-turbo',
        processingTime: Date.now() - startTime,
      };
    } catch (error) {
      throw new Error(`OpenAI analysis failed: ${(error as Error).message}`);
    }
  }

  /**
   * Analyze with local model (rule-based fallback)
   */
  private async analyzeWithLocal(text: string): Promise<SentimentResult> {
    const startTime = Date.now();

    // Simple rule-based sentiment analysis
    const positiveWords = [
      'good',
      'great',
      'excellent',
      'amazing',
      'wonderful',
      'fantastic',
      'love',
      'best',
      'happy',
      'perfect',
    ];
    const negativeWords = [
      'bad',
      'terrible',
      'awful',
      'horrible',
      'worst',
      'hate',
      'poor',
      'disappointing',
      'sad',
      'angry',
    ];

    const lowerText = text.toLowerCase();
    let positiveCount = 0;
    let negativeCount = 0;

    for (const word of positiveWords) {
      positiveCount += (lowerText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
    }

    for (const word of negativeWords) {
      negativeCount += (lowerText.match(new RegExp(`\\b${word}\\b`, 'g')) || []).length;
    }

    const total = positiveCount + negativeCount;
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    let score = 0;

    if (total > 0) {
      score = (positiveCount - negativeCount) / total;
      if (score > 0.2) {
        sentiment = 'positive';
      } else if (score < -0.2) {
        sentiment = 'negative';
      }
    }

    return {
      sentiment,
      score,
      confidence: Math.min(total / 10, 0.7), // Lower confidence for rule-based
      model: 'local:rule-based',
      processingTime: Date.now() - startTime,
    };
  }

  /**
   * Aggregate multiple sentiment results
   */
  private aggregateResults(results: SentimentResult[]): SentimentResult {
    if (results.length === 1) {
      return results[0];
    }

    const strategy = this.config.aggregationStrategy;

    if (strategy === 'weighted') {
      // Weight by confidence
      let totalWeightedScore = 0;
      let totalConfidence = 0;
      const emotions: Record<string, number> = {};

      for (const result of results) {
        const weight = result.confidence;
        totalWeightedScore += result.score * weight;
        totalConfidence += weight;

        // Aggregate emotions
        if (result.emotions) {
          for (const [emotion, value] of Object.entries(result.emotions)) {
            emotions[emotion] = (emotions[emotion] || 0) + value * weight;
          }
        }
      }

      const avgScore = totalWeightedScore / totalConfidence;
      const avgConfidence = totalConfidence / results.length;

      // Normalize emotions
      for (const emotion in emotions) {
        emotions[emotion] /= totalConfidence;
      }

      let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
      if (avgScore > 0.1) {
        sentiment = 'positive';
      } else if (avgScore < -0.1) {
        sentiment = 'negative';
      }

      return {
        sentiment,
        score: avgScore,
        confidence: avgConfidence,
        emotions,
        model: `aggregated:${results.map((r) => r.model).join('+')}`,
        processingTime: Math.max(...results.map((r) => r.processingTime)),
      };
    }

    if (strategy === 'majority') {
      // Simple majority vote
      const counts = { positive: 0, negative: 0, neutral: 0 };
      for (const result of results) {
        counts[result.sentiment]++;
      }

      const sentiment = Object.entries(counts).reduce((a, b) => (b[1] > a[1] ? b : a))[0] as
        | 'positive'
        | 'negative'
        | 'neutral';

      const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
      const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

      return {
        sentiment,
        score: avgScore,
        confidence: avgConfidence,
        model: `majority:${results.length}`,
        processingTime: Math.max(...results.map((r) => r.processingTime)),
      };
    }

    // Default: average
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (avgScore > 0.1) {
      sentiment = 'positive';
    } else if (avgScore < -0.1) {
      sentiment = 'negative';
    }

    return {
      sentiment,
      score: avgScore,
      confidence: avgConfidence,
      model: `average:${results.length}`,
      processingTime: Math.max(...results.map((r) => r.processingTime)),
    };
  }
}

/**
 * Create sentiment processor from environment variables
 */
export const createSentimentProcessorFromEnv = (): SentimentProcessor => {
  return new SentimentProcessor({
    enableHuggingFace: !process.env.SENTIMENT_MODELS || process.env.SENTIMENT_MODELS.includes('huggingface'),
    enableOpenAI: process.env.SENTIMENT_MODELS?.includes('openai'),
    enableLocal: process.env.SENTIMENT_MODELS?.includes('local'),
    huggingFaceApiKey: process.env.HUGGINGFACE_API_KEY,
    huggingFaceModel: process.env.HUGGINGFACE_SENTIMENT_MODEL,
    openAIApiKey: process.env.OPENAI_API_KEY,
  });
};

