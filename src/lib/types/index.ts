// Core type definitions for the Autonomous Video Creation Studio

export type ProjectStatus = 'draft' | 'analyzing' | 'planning' | 'ready' | 'generating' | 'inspecting' | 'repairing' | 'approved' | 'compiling' | 'exporting' | 'complete' | 'failed' | 'cancelled';

export type JobStatus = 'queued' | 'preparing' | 'generating' | 'downloading' | 'inspecting' | 'repairing' | 'approved' | 'failed' | 'cancelled';

export type AssetType = 'reference_video' | 'reference_image' | 'subject_image' | 'environment_image' | 'generated_video' | 'frame' | 'audio' | 'voice' | 'sfx' | 'export';

export type ProviderType = 'fal' | 'replicate' | 'elevenlabs' | 'muse' | 'local';

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  status: ProjectStatus;
  settings: ProjectSettings;
  referenceAnalysis?: ReferenceAnalysis;
  scenes: Scene[];
  assets: Asset[];
  exports: Export[];
  learningData?: ProjectLearningData;
}

export interface ProjectSettings {
  aspectRatio: '16:9' | '9:16' | '4:3' | '1:1' | 'custom';
  customWidth?: number;
  customHeight?: number;
  duration: number; // seconds
  fps: number;
  model: string;
  provider: ProviderType;
  style?: string;
  negativePrompt?: string;
  maxAttempts: number;
  voiceEnabled: boolean;
  voiceProvider?: 'elevenlabs' | 'xtts';
  voiceId?: string;
  sfxEnabled: boolean;
  musicEnabled: boolean;
  resolution: '720p' | '1080p' | '4k';
  seed?: number;
}

export interface SceneAudio {
  voiceAssetId?: string;
  sfxAssetId?: string;
  musicAssetId?: string;
  voiceVolume?: number;
  sfxVolume?: number;
  musicVolume?: number;
}

export interface Scene {
  id: string;
  projectId: string;
  index: number;
  name: string;
  description?: string;
  prompt: string;
  negativePrompt?: string;
  duration: number;
  status: JobStatus;
  attempts: GenerationAttempt[];
  approvedAttemptId?: string;
  audio?: SceneAudio;
  continuityConstraints?: ContinuityConstraints;
  createdAt: Date;
  updatedAt: Date;
}

export interface GenerationAttempt {
  id: string;
  sceneId: string;
  attemptNumber: number;
  prompt: string;
  negativePrompt?: string;
  parameters: GenerationParameters;
  provider: ProviderType;
  model: string;
  status: JobStatus;
  inputAssets: string[]; // asset IDs
  outputAssetId?: string;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  generationTime?: number; // ms
  qaReport?: QualityReport;
  mutationSummary?: string;
}

export interface GenerationParameters {
  width: number;
  height: number;
  fps: number;
  frameCount: number;
  duration: number;
  seed?: number;
  guidanceScale?: number;
  strength?: number;
  steps?: number;
  providerSpecific?: Record<string, unknown>;
}

export interface QualityReport {
  passed: boolean;
  overallAssessment: string;
  issues: QualityIssue[];
  severity: Record<string, 'critical' | 'high' | 'medium' | 'low'>;
  referenceMatch: ReferenceMatchScore;
  motionQuality: MotionQualityScore;
  subjectConsistency: ConsistencyScore;
  environmentConsistency: ConsistencyScore;
  physics: PhysicsScore;
  continuity: ContinuityScore;
  recommendedMutations: PromptMutation[];
  inspectedAt: Date;
}

export interface QualityIssue {
  id: string;
  type: string;
  description: string;
  location?: { x: number; y: number; width: number; height: number };
  frameIndex?: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  likelyCause: string;
  correctiveInstruction: string;
}

export interface ReferenceMatchScore {
  score: number; // 0-1
  composition: number;
  movement: number;
  pacing: number;
  lighting: number;
  color: number;
  details: string;
}

export interface MotionQualityScore {
  score: number;
  cameraStability: number;
  subjectMotionNaturalness: number;
  temporalConsistency: number;
  details: string;
}

export interface ConsistencyScore {
  score: number;
  geometry: number;
  appearance: number;
  details: string;
}

export interface PhysicsScore {
  score: number;
  collisions: number;
  gravity: number;
  materialBehavior: number;
  details: string;
}

export interface ContinuityScore {
  score: number;
  subject: number;
  environment: number;
  lighting: number;
  details: string;
}

export interface PromptMutation {
  defectType: string;
  originalInstruction: string;
  correctedInstruction: string;
  confidence: number;
}

export interface Asset {
  id: string;
  projectId: string;
  type: AssetType;
  filename: string;
  mimeType: string;
  size: number;
  path: string;
  url?: string;
  metadata: AssetMetadata;
  thumbnailPath?: string;
  createdAt: Date;
}

export interface AssetMetadata {
  width?: number;
  height?: number;
  duration?: number;
  fps?: number;
  frameCount?: number;
  codec?: string;
  format?: string;
  [key: string]: unknown;
}

export interface Export {
  id: string;
  projectId: string;
  name: string;
  preset: ExportPreset;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputPath?: string;
  error?: string;
  createdAt: Date;
  completedAt?: Date;
}

export type ExportPreset = 'vertical-short' | 'landscape' | 'youtube' | 'custom';

export interface ContinuityConstraints {
  subjectLock?: SubjectConstraint;
  environmentLock?: EnvironmentConstraint;
  cameraConstraints?: CameraConstraints;
  lightingConstraints?: LightingConstraints;
}

export interface SubjectConstraint {
  type: 'product' | 'character' | 'object';
  referenceAssetId: string;
  silhouette: boolean;
  shape: boolean;
  color: boolean;
  materials: boolean;
  distinguishingFeatures: string[];
  dimensions?: { width: number; height: number; depth: number };
  prohibitedChanges: string[];
}

export interface EnvironmentConstraint {
  referenceAssetId?: string;
  architecture: boolean;
  furniture: boolean;
  surfaces: boolean;
  landmarks: string[];
  lighting: boolean;
}

export interface CameraConstraints {
  movementType: string;
  velocity: 'slow' | 'medium' | 'fast';
  path: 'linear' | 'curved' | 'orbit' | 'handheld' | 'stabilized';
  framing: 'wide' | 'medium' | 'close' | 'extreme-close';
}

export interface LightingConstraints {
  direction: string;
  quality: 'hard' | 'soft' | 'mixed';
  colorTemperature: number;
  keyLightPosition: string;
  fillLight: boolean;
  rimLight: boolean;
}

// Reference Video Analysis Types
export interface ReferenceAnalysis {
  id: string;
  projectId: string;
  videoAssetId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  video: VideoMetadata;
  visualStyle: VisualStyle;
  shots: ShotAnalysis[];
  cameraLanguage: CameraLanguage;
  lighting: LightingAnalysis;
  motionLanguage: MotionLanguage;
  transitions: TransitionAnalysis[];
  editingRhythm: EditingRhythm;
  audioNotes: AudioNotes;
  uncertainties: Uncertainty[];
  recreationStrategy: RecreationStrategy;
  analyzedAt: Date;
  model: string;
}

export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  orientation: 'landscape' | 'portrait' | 'square';
  estimatedShotCount: number;
  fileSize: number;
}

export interface VisualStyle {
  genre: string;
  mood: string;
  colorPalette: string[];
  lightingStyle: string;
  compositionStyle: string;
  depthOfField: 'shallow' | 'medium' | 'deep';
  texture: string;
  overallImpression: string;
}

export interface ShotAnalysis {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  shotType: 'wide' | 'medium' | 'close' | 'extreme-close' | 'establishing' | 'detail' | 'pov' | 'over-the-shoulder';
  subject: string;
  environment: string;
  action: string;
  cameraMovement: CameraMovement;
  cameraPosition: string;
  framing: string;
  lensPerspective: string;
  depth: string;
  foreground: string;
  background: string;
  lighting: ShotLighting;
  color: string;
  composition: string;
  motion: ShotMotion;
  transitionType: 'cut' | 'fade' | 'dissolve' | 'wipe' | 'match-cut' | 'j-cut' | 'l-cut';
  visualEmphasis: string;
  functionalPurpose: 'establish' | 'introduce' | 'reveal' | 'anticipate' | 'interact' | 'detail' | 'transition' | 'close';
  confidence: number;
}

export interface CameraMovement {
  type: 'static' | 'pan' | 'tilt' | 'dolly' | 'truck' | 'pedestal' | 'crane' | 'orbit' | 'tracking' | 'push-in' | 'pull-out' | 'handheld' | 'stabilized' | 'combination';
  direction?: string;
  velocity: 'very-slow' | 'slow' | 'medium' | 'fast' | 'very-fast';
  acceleration: 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear' | 'variable';
  stabilization: 'tripod' | 'gimbal' | 'handheld' | 'steadicam' | 'dolly' | 'vehicle';
  parallax: boolean;
  rackFocus: boolean;
  details: string;
}

export interface ShotLighting {
  keyDirection: string;
  quality: 'hard' | 'soft' | 'mixed';
  colorTemperature: number;
  contrast: 'low' | 'medium' | 'high';
  rimLight: boolean;
  fillLight: boolean;
  practicalLights: string[];
  mood: string;
}

export interface ShotMotion {
  cameraMovement: string;
  subjectMovement: string;
  relativeMotion: string;
  approximateVelocity: string;
  stabilizationBehavior: string;
}

export interface CameraLanguage {
  dominantMovements: string[];
  movementVocabulary: string[];
  framingPreferences: string[];
  lensCharacteristics: string[];
  depthStrategy: string;
  compositionRules: string[];
  pacing: 'slow' | 'medium' | 'fast' | 'variable';
  rhythmPattern: string;
}

export interface LightingAnalysis {
  overallStyle: string;
  keyLightPatterns: string[];
  colorTemperatureRange: [number, number];
  contrastApproach: string;
  rimLightUsage: boolean;
  practicalLighting: boolean;
  moodContribution: string;
}

export interface MotionLanguage {
  cameraVocabulary: string[];
  subjectMotionPatterns: string[];
  velocityProfile: 'consistent-slow' | 'consistent-medium' | 'consistent-fast' | 'variable' | 'escalating' | 'de-escalating';
  stabilizationApproach: string;
  transitionStyle: string;
  spatialRelationships: string[];
}

export interface TransitionAnalysis {
  fromShot: number;
  toShot: number;
  type: string;
  duration: number;
  technique: string;
  effect: string;
}

export interface EditingRhythm {
  averageShotDuration: number;
  shotDurationPattern: 'consistent' | 'accelerating' | 'decelerating' | 'variable' | 'musical';
  closeUpRatio: number;
  wideShotRatio: number;
  cuttingStyle: 'continuity' | 'montage' | 'jump' | 'match-action' | 'thematic';
  pacingDescription: string;
}

export interface AudioNotes {
  hasAudio: boolean;
  musicStyle?: string;
  sfxPresent?: boolean;
  narrationPresent?: boolean;
  audioQuality?: string;
  syncNotes?: string;
  limitations: string[];
}

export interface Uncertainty {
  aspect: string;
  description: string;
  confidence: number;
  reason: string;
}

export interface RecreationStrategy {
  preserve: string[];
  replace: string[];
  adapt: string[];
  constraints: string[];
  perShotSpecifications: PerShotSpecification[];
  masterPromptGuidance: string;
  negativePromptGuidance: string;
}

export interface PerShotSpecification {
  shotIndex: number;
  preservedElements: string[];
  replacedElements: string[];
  adaptedElements: string[];
  generationPrompt: string;
  negativePrompt: string;
  keyConstraints: string[];
}

// Learning System Types
export interface ProjectLearningData {
  generationExperiences: GenerationExperience[];
  correctionPatterns: CorrectionPattern[];
  generationStrategies: GenerationStrategy[];
  modelPerformance: ModelPerformanceRecord[];
}

export interface GenerationExperience {
  id: string;
  projectId: string;
  sceneId: string;
  model: string;
  provider: ProviderType;
  inputSignature: string;
  prompt: string;
  parameters: GenerationParameters;
  referenceFeatures: ReferenceFeatures;
  resultFeatures: ResultFeatures;
  qaResult: QualityReport;
  defects: QualityIssue[];
  corrections: PromptMutation[];
  userFeedback?: UserFeedback;
  successScore: number; // 0-1
  confidence: number;
  createdAt: Date;
}

export interface ReferenceFeatures {
  subjectType: string;
  environment: string;
  cameraMovement: string;
  style: string;
  lighting: string;
  duration: number;
  aspectRatio: string;
}

export interface ResultFeatures {
  qualityScore: number;
  defectCount: number;
  criticalDefects: number;
  generationTime: number;
  attemptCount: number;
}

export interface UserFeedback {
  action: 'approved' | 'rejected' | 'edited' | 'regenerated';
  attemptNumber: number;
  notes?: string;
  timestamp: Date;
}

export interface CorrectionPattern {
  id: string;
  defectType: string;
  correction: string;
  successfulCount: number;
  failedCount: number;
  confidence: number;
  lastUsed: Date;
  examples: CorrectionExample[];
}

export interface CorrectionExample {
  experienceId: string;
  beforePrompt: string;
  afterPrompt: string;
  result: 'success' | 'failure';
}

export interface GenerationStrategy {
  id: string;
  name: string;
  conditions: StrategyConditions;
  promptPattern: string;
  parameters: Partial<GenerationParameters>;
  successRate: number;
  averageAttempts: number;
  averageGenerationTime: number;
  confidence: number;
  usageCount: number;
}

export interface StrategyConditions {
  subjectType?: string;
  environment?: string;
  cameraMovement?: string;
  style?: string;
  model?: string;
  aspectRatio?: string;
}

export interface ModelPerformanceRecord {
  model: string;
  provider: ProviderType;
  taskType: string;
  generations: number;
  approved: number;
  rejected: number;
  averageAttempts: number;
  averageGenerationTime: number;
  commonDefects: string[];
  lastUpdated: Date;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// WebSocket Events
export interface WSMessage<T = unknown> {
  type: string;
  payload: T;
  timestamp: Date;
}

export interface GenerationProgress {
  jobId: string;
  status: JobStatus;
  progress: number;
  message: string;
  currentAttempt?: number;
  maxAttempts?: number;
}

export interface AnalysisProgress {
  analysisId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  message: string;
}