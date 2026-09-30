// Muse Spark 1.3 Client - Core visual reasoning and analysis engine

import { getConfig } from '@/lib/config';
import type { ReferenceAnalysis, ShotAnalysis, QualityReport, QualityIssue, PromptMutation, ReferenceFeatures, ResultFeatures, GenerationExperience } from '@/lib/types';

const MUSE_API_BASE = 'https://api.muse.meta.com/v1';

export interface MuseSparkConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface MuseRequestOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json_object';
  systemPrompt?: string;
  userPrompt: string;
  images?: string[]; // base64 or URLs
  video?: string; // base64 or URL
  previousResponseId?: string; // for continued reasoning
}

export interface MuseResponse {
  id: string;
  output: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  status: 'completed' | 'failed' | 'in_progress';
  error?: string;
}

export class MuseSparkClient {
  private config: MuseSparkConfig;
  private baseUrl: string;

  constructor(config?: Partial<MuseSparkConfig>) {
    const envConfig = getConfig();
    this.config = {
      apiKey: config?.apiKey || envConfig.MODEL_API_KEY || '',
      baseUrl: config?.baseUrl || MUSE_API_BASE,
      timeout: config?.timeout || 120000,
    };
    this.baseUrl = this.config.baseUrl!;
  }

  async analyzeReferenceVideo(
    videoBase64: string,
    referenceImages: string[],
    userIntent: string
  ): Promise<ReferenceAnalysis> {
    const systemPrompt = this.buildReferenceAnalysisSystemPrompt();
    const userPrompt = this.buildReferenceAnalysisUserPrompt(userIntent, referenceImages.length);

    const response = await this.callMuse({
      systemPrompt,
      userPrompt,
      video: videoBase64,
      images: referenceImages,
      responseFormat: 'json_object',
      temperature: 0.3,
      maxTokens: 8192,
    });

    return this.parseReferenceAnalysis(response.output);
  }

  async inspectGeneration(
    generatedFrames: string[],
    referenceAnalysis: ReferenceAnalysis,
    referenceFrames: string[],
    userIntent: string,
    subjectConstraints: any,
    environmentConstraints: any
  ): Promise<QualityReport> {
    const systemPrompt = this.buildInspectionSystemPrompt();
    const userPrompt = this.buildInspectionUserPrompt(
      userIntent,
      referenceAnalysis,
      subjectConstraints,
      environmentConstraints
    );

    const response = await this.callMuse({
      systemPrompt,
      userPrompt,
      images: [...generatedFrames, ...referenceFrames],
      responseFormat: 'json_object',
      temperature: 0.2,
      maxTokens: 8192,
    });

    return this.parseQualityReport(response.output);
  }

  async mutatePrompt(
    originalPrompt: string,
    negativePrompt: string,
    qualityReport: QualityReport,
    referenceAnalysis: ReferenceAnalysis,
    attemptNumber: number
  ): Promise<{ prompt: string; negativePrompt: string; mutations: PromptMutation[] }> {
    const systemPrompt = this.buildMutationSystemPrompt();
    const userPrompt = this.buildMutationUserPrompt(
      originalPrompt,
      negativePrompt,
      qualityReport,
      referenceAnalysis,
      attemptNumber
    );

    const response = await this.callMuse({
      systemPrompt,
      userPrompt,
      responseFormat: 'json_object',
      temperature: 0.4,
      maxTokens: 4096,
    });

    return this.parseMutationResponse(response.output);
  }

  async generateCreativePlan(
    referenceAnalysis: ReferenceAnalysis,
    intent: string,
    subjectImages: string[],
    environmentImages: string[],
    constraints: any
  ): Promise<{ masterPrompt: string; shotPrompts: string[]; negativePrompt: string; parameters: any }> {
    const systemPrompt = this.buildCreativePlanSystemPrompt();
    const builtPrompt = this.buildCreativePlanUserPrompt(
      referenceAnalysis,
      intent,
      subjectImages.length,
      environmentImages.length,
      constraints
    );

    const response = await this.callMuse({
      systemPrompt,
      userPrompt: builtPrompt,
      images: [...subjectImages, ...environmentImages],
      responseFormat: 'json_object',
      temperature: 0.5,
      maxTokens: 8192,
    });

    return this.parseCreativePlan(response.output);
  }

  async extractReferenceFeatures(analysis: ReferenceAnalysis): Promise<ReferenceFeatures> {
    const systemPrompt = `Extract key features from this reference analysis for similarity matching.
Return JSON with: subjectType, environment, cameraMovement, style, lighting, duration, aspectRatio`;

    const userPrompt = JSON.stringify(analysis);

    const response = await this.callMuse({
      systemPrompt,
      userPrompt,
      responseFormat: 'json_object',
      temperature: 0.1,
      maxTokens: 1024,
    });

    return JSON.parse(response.output);
  }

  async evaluateResultFeatures(
    generatedFrames: string[],
    referenceAnalysis: ReferenceAnalysis
  ): Promise<ResultFeatures> {
    const systemPrompt = `Evaluate the generated result and extract features for learning.
Return JSON with: qualityScore (0-1), defectCount, criticalDefects, generationTime, attemptCount`;

    const userPrompt = `Reference: ${JSON.stringify(referenceAnalysis)}`;

    const response = await this.callMuse({
      systemPrompt,
      userPrompt,
      images: generatedFrames,
      responseFormat: 'json_object',
      temperature: 0.2,
      maxTokens: 1024,
    });

    return JSON.parse(response.output);
  }

  private async callMuse(options: MuseRequestOptions): Promise<MuseResponse> {
    if (!this.config.apiKey) {
      throw new Error('Muse Spark API key not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const messages = this.buildMessages(options);

      const response = await fetch(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model || 'muse-spark-1.3',
          input: messages,
          temperature: options.temperature || 0.3,
          max_output_tokens: options.maxTokens || 4096,
          response_format: options.responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
          previous_response_id: options.previousResponseId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Muse API error: ${response.status} - ${error}`);
      }

      const data = await response.json();
      return this.parseResponse(data);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Muse API request timeout');
      }
      throw error;
    }
  }

  private buildMessages(options: MuseRequestOptions): any[] {
    const messages: any[] = [];

    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    const userContent: any[] = [{ type: 'text', text: options.userPrompt }];

    if (options.images && options.images.length > 0) {
      for (const image of options.images) {
        userContent.push({
          type: 'image_url',
          image_url: { url: image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}` },
        });
      }
    }

    if (options.video) {
      userContent.push({
        type: 'video_url',
        video_url: { url: options.video.startsWith('data:') ? options.video : `data:video/mp4;base64,${options.video}` },
      });
    }

    messages.push({ role: 'user', content: userContent });

    return messages;
  }

  private parseResponse(data: any): MuseResponse {
    return {
      id: data.id || '',
      output: data.output?.[0]?.content?.[0]?.text || data.output_text || JSON.stringify(data),
      usage: data.usage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      status: data.status || 'completed',
      error: data.error,
    };
  }

  // System Prompts
  private buildReferenceAnalysisSystemPrompt(): string {
    return `You are the cinematic reverse-engineering and generation-planning engine for an autonomous video creation system.

Analyze the supplied reference video as a temporal visual sequence. Determine:
- Shot structure with precise timing
- Framing, camera movement, subject movement
- Environmental movement, lighting, composition
- Visual rhythm, transitions, continuity requirements

Do not merely describe the video. Convert observed characteristics into ACTIONABLE INSTRUCTIONS for a downstream video generation model.

Separate:
1. Reference-preserved characteristics (camera language, movement, pacing, composition, lighting logic)
2. Subject-replaced characteristics (identity, product, character)
3. Environment-replaced characteristics (location, architecture, furnishings)
4. Uncertain observations (mark clearly with confidence scores)
5. Critical constraints (what must not change)

Never invent a feature not supported by the reference.

Output structured JSON matching the ReferenceAnalysis schema exactly.`;
  }

  private buildReferenceAnalysisUserPrompt(userIntent: string, refImageCount: number): string {
    return `USER INTENT: "${userIntent}"

Reference video provided for analysis. ${refImageCount} reference images also provided for subject/environment context.

Analyze the video comprehensively and produce the complete ReferenceAnalysis JSON. Focus on transferable cinematic characteristics that can be applied to new subject/environment combinations.`;
  }

  private buildInspectionSystemPrompt(): string {
    return `You are the visual quality-control inspector for an autonomous video generation system.

Compare:
1. Requested creative intent
2. Reference analysis (cinematic structure to replicate)
3. Reference media where supplied
4. Generated frames/video
5. Locked subject/environment constraints

Detect:
- Visual artifacts (temporal instability, flickering, tearing)
- Anatomy errors (extra/missing limbs, broken hands, distorted faces)
- Object deformation (product shape drift, geometry changes)
- Identity drift (subject appearance inconsistency)
- Camera mismatch (movement type, velocity, framing vs reference)
- Composition mismatch (rule of thirds, depth, visual hierarchy)
- Lighting mismatch (direction, quality, color temperature, shadows)
- Physics violations (floating objects, impossible collisions, gravity)
- Continuity failures (subject/environment/lighting changes between frames)
- Unwanted content (hallucinated objects, text, watermarks)

Classify each issue: critical | high | medium | low

For every issue provide:
- Precise identification
- Location (frame index, spatial coordinates if applicable)
- Likely cause
- Targeted corrective instruction for prompt mutation

Return machine-readable QualityReport JSON. Do not approve based on aesthetic appeal alone - judge against requested constraints.`;
  }

  private buildInspectionUserPrompt(
    userIntent: string,
    referenceAnalysis: ReferenceAnalysis,
    subjectConstraints: any,
    environmentConstraints: any
  ): string {
    return `CREATIVE INTENT: "${userIntent}"

REFERENCE ANALYSIS (cinematic structure to match):
${JSON.stringify(referenceAnalysis, null, 2)}

SUBJECT CONSTRAINTS (must preserve):
${JSON.stringify(subjectConstraints, null, 2)}

ENVIRONMENT CONSTRAINTS (must preserve):
${JSON.stringify(environmentConstraints, null, 2)}

Generated frames and reference frames provided as images. Inspect thoroughly and produce QualityReport.`;
  }

  private buildMutationSystemPrompt(): string {
    return `You are the prompt mutation engine for an autonomous video generation system.

Given a failed generation with specific detected defects, produce TARGETED CORRECTIONS to the generation prompt.

RULES:
- NEVER use generic quality boosters ("better quality", "more realistic", "high detail")
- Map EACH defect to a SPECIFIC corrective instruction
- Preserve all working elements from the original prompt
- Add constraints that directly address the failure mode
- Use negative prompts for what to avoid
- Keep prompts concise and model-compatible

Example:
Defect: "product geometry drift"
Correction: "preserve exact physical geometry, dimensions, silhouette, button placement and transparent display surface from reference image"

Defect: "camera movement too fast"
Correction: "reduce camera tracking velocity to slow cinematic pace, maintain gradual acceleration/deceleration"

Return JSON with: prompt, negativePrompt, mutations[].`;
  }

  private buildMutationUserPrompt(
    originalPrompt: string,
    negativePrompt: string,
    qualityReport: QualityReport,
    referenceAnalysis: ReferenceAnalysis,
    attemptNumber: number
  ): string {
    return `ATTEMPT ${attemptNumber} FAILED - MUTATION REQUIRED

ORIGINAL PROMPT:
${originalPrompt}

ORIGINAL NEGATIVE PROMPT:
${negativePrompt}

QUALITY REPORT:
${JSON.stringify(qualityReport, null, 2)}

REFERENCE ANALYSIS (for context):
${JSON.stringify(referenceAnalysis.recreationStrategy, null, 2)}

Produce corrected prompt and negative prompt with targeted mutations for each detected issue.`;
  }

  private buildCreativePlanSystemPrompt(): string {
    return `You are the creative translation engine. Convert reference video analysis into a generation plan for NEW subject/environment.

Input:
- Reference analysis (cinematic DNA)
- User creative intent
- Subject images (product/character)
- Environment images (location)
- Constraints

Output:
- Master prompt capturing cinematic language
- Per-shot prompts with preserved/replaced/adapted elements
- Negative prompt
- Generation parameters
- Continuity constraints

PRESERVE from reference: composition, movement, pacing, choreography, visual rhythm, lighting logic, depth strategy
REPLACE: subject identity, environment, product, specific objects
ADAPT: lighting to new environment, camera to new subject scale

Output structured JSON only.`;
  }

  private buildCreativePlanUserPrompt(
    referenceAnalysis: ReferenceAnalysis,
    userPrompt: string,
    subjectImageCount: number,
    environmentImageCount: number,
    constraints: any
  ): string {
    return `USER INTENT: "${userPrompt}"

REFERENCE ANALYSIS:
${JSON.stringify(referenceAnalysis, null, 2)}

SUBJECT IMAGES: ${subjectImageCount} provided
ENVIRONMENT IMAGES: ${environmentImageCount} provided

CONSTRAINTS:
${JSON.stringify(constraints, null, 2)}

Create complete generation plan with master prompt, shot prompts, negative prompt, parameters, and continuity constraints.`;
  }

  // Parsers
  private parseReferenceAnalysis(output: string): ReferenceAnalysis {
    try {
      const parsed = JSON.parse(output);
      // Validate and ensure required fields
      return this.validateReferenceAnalysis(parsed);
    } catch (error) {
      throw new Error(`Failed to parse reference analysis: ${error}`);
    }
  }

  private validateReferenceAnalysis(data: any): ReferenceAnalysis {
    // Ensure all required fields exist with defaults
    return {
      id: data.id || crypto.randomUUID(),
      projectId: data.projectId || '',
      videoAssetId: data.videoAssetId || '',
      status: 'completed',
      video: data.video || { duration: 0, width: 0, height: 0, fps: 0, codec: '', orientation: 'landscape', estimatedShotCount: 0, fileSize: 0 },
      visualStyle: data.visualStyle || {},
      shots: data.shots || [],
      cameraLanguage: data.cameraLanguage || {},
      lighting: data.lighting || {},
      motionLanguage: data.motionLanguage || {},
      transitions: data.transitions || [],
      editingRhythm: data.editingRhythm || {},
      audioNotes: data.audioNotes || { hasAudio: false, limitations: [] },
      uncertainties: data.uncertainties || [],
      recreationStrategy: data.recreationStrategy || { preserve: [], replace: [], adapt: [], constraints: [], perShotSpecifications: [], masterPromptGuidance: '', negativePromptGuidance: '' },
      analyzedAt: new Date(),
      model: data.model || 'muse-spark-1.3',
    };
  }

  private parseQualityReport(output: string): QualityReport {
    try {
      const parsed = JSON.parse(output);
      return this.validateQualityReport(parsed);
    } catch (error) {
      throw new Error(`Failed to parse quality report: ${error}`);
    }
  }

  private validateQualityReport(data: any): QualityReport {
    return {
      passed: data.passed ?? false,
      overallAssessment: data.overallAssessment || '',
      issues: data.issues || [],
      severity: data.severity || {},
      referenceMatch: data.referenceMatch || { score: 0, composition: 0, movement: 0, pacing: 0, lighting: 0, color: 0, details: '' },
      motionQuality: data.motionQuality || { score: 0, cameraStability: 0, subjectMotionNaturalness: 0, temporalConsistency: 0, details: '' },
      subjectConsistency: data.subjectConsistency || { score: 0, geometry: 0, appearance: 0, details: '' },
      environmentConsistency: data.environmentConsistency || { score: 0, geometry: 0, appearance: 0, details: '' },
      physics: data.physics || { score: 0, collisions: 0, gravity: 0, materialBehavior: 0, details: '' },
      continuity: data.continuity || { score: 0, subject: 0, environment: 0, lighting: 0, details: '' },
      recommendedMutations: data.recommendedMutations || [],
      inspectedAt: new Date(),
    };
  }

  private parseMutationResponse(output: string): { prompt: string; negativePrompt: string; mutations: PromptMutation[] } {
    try {
      return JSON.parse(output);
    } catch {
      // Fallback parsing
      return {
        prompt: output,
        negativePrompt: '',
        mutations: [],
      };
    }
  }

  private parseCreativePlan(output: string): { masterPrompt: string; shotPrompts: string[]; negativePrompt: string; parameters: any } {
    try {
      return JSON.parse(output);
    } catch {
      return {
        masterPrompt: output,
        shotPrompts: [],
        negativePrompt: '',
        parameters: {},
      };
    }
  }

  // Utility
  async testConnection(): Promise<boolean> {
    try {
      await this.callMuse({
        userPrompt: 'Test connection',
        maxTokens: 10,
        temperature: 0,
      });
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
let museClient: MuseSparkClient | null = null;

export function getMuseClient(config?: Partial<MuseSparkConfig>): MuseSparkClient {
  if (!museClient) {
    museClient = new MuseSparkClient(config);
  }
  return museClient;
}

export function resetMuseClient() {
  museClient = null;
}