// Database layer using better-sqlite3 for local development

import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import type { Project, Scene, Asset, GenerationAttempt, Export, QualityReport, ReferenceAnalysis, ProjectLearningData, GenerationExperience, ReferenceFeatures } from '@/lib/types';

const DB_DIR = process.env.DB_DIR || './data';
const DB_PATH = join(DB_DIR, 'studio.db');

// Ensure database directory exists
if (!existsSync(DB_DIR)) {
  mkdirSync(DB_DIR, { recursive: true });
}

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) return db;
  
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  
  initializeSchema(db);
  return db;
}

function initializeSchema(db: Database.Database) {
  // Projects table
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      settings TEXT NOT NULL,
      reference_analysis_id TEXT,
      learning_data TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // Scenes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      index_num INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      prompt TEXT NOT NULL,
      negative_prompt TEXT,
      duration REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      approved_attempt_id TEXT,
      audio TEXT,
      continuity_constraints TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, index_num)
    )
  `);

  // Assets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      path TEXT NOT NULL,
      url TEXT,
      metadata TEXT NOT NULL,
      thumbnail_path TEXT,
      created_at TEXT NOT NULL
    )
  `);

  // Generation attempts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_attempts (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      attempt_number INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      negative_prompt TEXT,
      parameters TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      input_assets TEXT NOT NULL,
      output_asset_id TEXT,
      error TEXT,
      started_at TEXT,
      completed_at TEXT,
      generation_time INTEGER,
      qa_report TEXT,
      mutation_summary TEXT,
      UNIQUE(scene_id, attempt_number)
    )
  `);

  // Exports table
  db.exec(`
    CREATE TABLE IF NOT EXISTS exports (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      preset TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      output_path TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )
  `);

  // Reference analyses table
  db.exec(`
    CREATE TABLE IF NOT EXISTS reference_analyses (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      video_asset_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      video TEXT NOT NULL,
      visual_style TEXT NOT NULL,
      shots TEXT NOT NULL,
      camera_language TEXT NOT NULL,
      lighting TEXT NOT NULL,
      motion_language TEXT NOT NULL,
      transitions TEXT NOT NULL,
      editing_rhythm TEXT NOT NULL,
      audio_notes TEXT NOT NULL,
      uncertainties TEXT NOT NULL,
      recreation_strategy TEXT NOT NULL,
      analyzed_at TEXT NOT NULL,
      model TEXT NOT NULL
    )
  `);

  // Learning system tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_experiences (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      scene_id TEXT NOT NULL,
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      input_signature TEXT NOT NULL,
      prompt TEXT NOT NULL,
      parameters TEXT NOT NULL,
      reference_features TEXT NOT NULL,
      result_features TEXT NOT NULL,
      qa_result TEXT NOT NULL,
      defects TEXT NOT NULL,
      corrections TEXT NOT NULL,
      user_feedback TEXT,
      success_score REAL NOT NULL,
      confidence REAL NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS correction_patterns (
      id TEXT PRIMARY KEY,
      defect_type TEXT NOT NULL,
      correction TEXT NOT NULL,
      successful_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      confidence REAL NOT NULL,
      last_used TEXT NOT NULL,
      examples TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_strategies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      conditions TEXT NOT NULL,
      prompt_pattern TEXT NOT NULL,
      parameters TEXT NOT NULL,
      success_rate REAL NOT NULL,
      average_attempts REAL NOT NULL,
      average_generation_time REAL NOT NULL,
      confidence REAL NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS model_performance (
      id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      task_type TEXT NOT NULL,
      generations INTEGER NOT NULL DEFAULT 0,
      approved INTEGER NOT NULL DEFAULT 0,
      rejected INTEGER NOT NULL DEFAULT 0,
      average_attempts REAL NOT NULL DEFAULT 0,
      average_generation_time REAL NOT NULL DEFAULT 0,
      common_defects TEXT NOT NULL DEFAULT '[]',
      last_updated TEXT NOT NULL,
      UNIQUE(model, provider, task_type)
    )
  `);

  // Indexes for performance
  db.exec(`CREATE INDEX IF NOT EXISTS idx_scenes_project ON scenes(project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_attempts_scene ON generation_attempts(scene_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_exports_project ON exports(project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_experiences_project ON generation_experiences(project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_experiences_scene ON generation_experiences(scene_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_correction_defect ON correction_patterns(defect_type)`);
}

// Project operations
export const projectDb = {
  create(project: Project): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO projects (id, name, description, status, settings, reference_analysis_id, learning_data, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      project.id,
      project.name,
      project.description || null,
      project.status,
      JSON.stringify(project.settings),
      project.referenceAnalysis?.id || null,
      JSON.stringify(project.learningData || null),
      project.createdAt.toISOString(),
      project.updatedAt.toISOString()
    );
  },

  get(id: string): Project | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!row) return null;
    return deserializeProject(row);
  },

  getAll(): Project[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as any[];
    return rows.map(deserializeProject);
  },

  update(project: Project): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE projects SET name = ?, description = ?, status = ?, settings = ?, 
        reference_analysis_id = ?, learning_data = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      project.name,
      project.description || null,
      project.status,
      JSON.stringify(project.settings),
      project.referenceAnalysis?.id || null,
      JSON.stringify(project.learningData || null),
      project.updatedAt.toISOString(),
      project.id
    );
  },

  delete(id: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  },
};

// Scene operations
export const sceneDb = {
  create(scene: Scene): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO scenes (id, project_id, index_num, name, description, prompt, negative_prompt, duration, status, approved_attempt_id, audio, continuity_constraints, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      scene.id,
      scene.projectId,
      scene.index,
      scene.name,
      scene.description || null,
      scene.prompt,
      scene.negativePrompt || null,
      scene.duration,
      scene.status,
      scene.approvedAttemptId || null,
      JSON.stringify(scene.audio || null),
      JSON.stringify(scene.continuityConstraints || null),
      scene.createdAt.toISOString(),
      scene.updatedAt.toISOString()
    );
  },

  get(id: string): Scene | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM scenes WHERE id = ?').get(id) as any;
    if (!row) return null;
    return deserializeScene(row);
  },

  getByProject(projectId: string): Scene[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM scenes WHERE project_id = ? ORDER BY index_num').all(projectId) as any[];
    return rows.map(deserializeScene);
  },

  update(scene: Scene): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE scenes SET name = ?, description = ?, prompt = ?, negative_prompt = ?, duration = ?, 
        status = ?, approved_attempt_id = ?, audio = ?, continuity_constraints = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      scene.name,
      scene.description || null,
      scene.prompt,
      scene.negativePrompt || null,
      scene.duration,
      scene.status,
      scene.approvedAttemptId || null,
      JSON.stringify(scene.audio || null),
      JSON.stringify(scene.continuityConstraints || null),
      scene.updatedAt.toISOString(),
      scene.id
    );
  },

  delete(id: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM scenes WHERE id = ?').run(id);
  },
};

// Asset operations
export const assetDb = {
  create(asset: Asset): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO assets (id, project_id, type, filename, mime_type, size, path, url, metadata, thumbnail_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      asset.id,
      asset.projectId,
      asset.type,
      asset.filename,
      asset.mimeType,
      asset.size,
      asset.path,
      asset.url || null,
      JSON.stringify(asset.metadata),
      asset.thumbnailPath || null,
      asset.createdAt.toISOString()
    );
  },

  get(id: string): Asset | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as any;
    if (!row) return null;
    return deserializeAsset(row);
  },

  getByProject(projectId: string): Asset[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM assets WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as any[];
    return rows.map(deserializeAsset);
  },

  getByProjectAndType(projectId: string, type: string): Asset[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM assets WHERE project_id = ? AND type = ? ORDER BY created_at DESC').all(projectId, type) as any[];
    return rows.map(deserializeAsset);
  },

  delete(id: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM assets WHERE id = ?').run(id);
  },
};

// Generation attempt operations
export const attemptDb = {
  create(attempt: GenerationAttempt): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO generation_attempts (id, scene_id, attempt_number, prompt, negative_prompt, parameters, provider, model, status, input_assets, output_asset_id, error, started_at, completed_at, generation_time, qa_report, mutation_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      attempt.id,
      attempt.sceneId,
      attempt.attemptNumber,
      attempt.prompt,
      attempt.negativePrompt || null,
      JSON.stringify(attempt.parameters),
      attempt.provider,
      attempt.model,
      attempt.status,
      JSON.stringify(attempt.inputAssets),
      attempt.outputAssetId || null,
      attempt.error || null,
      attempt.startedAt?.toISOString() || null,
      attempt.completedAt?.toISOString() || null,
      attempt.generationTime || null,
      JSON.stringify(attempt.qaReport || null),
      attempt.mutationSummary || null
    );
  },

  get(id: string): GenerationAttempt | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM generation_attempts WHERE id = ?').get(id) as any;
    if (!row) return null;
    return deserializeAttempt(row);
  },

  getByScene(sceneId: string): GenerationAttempt[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM generation_attempts WHERE scene_id = ? ORDER BY attempt_number').all(sceneId) as any[];
    return rows.map(deserializeAttempt);
  },

  update(attempt: GenerationAttempt): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE generation_attempts SET prompt = ?, negative_prompt = ?, parameters = ?, provider = ?, model = ?, 
        status = ?, input_assets = ?, output_asset_id = ?, error = ?, started_at = ?, completed_at = ?, 
        generation_time = ?, qa_report = ?, mutation_summary = ?
      WHERE id = ?
    `);
    stmt.run(
      attempt.prompt,
      attempt.negativePrompt || null,
      JSON.stringify(attempt.parameters),
      attempt.provider,
      attempt.model,
      attempt.status,
      JSON.stringify(attempt.inputAssets),
      attempt.outputAssetId || null,
      attempt.error || null,
      attempt.startedAt?.toISOString() || null,
      attempt.completedAt?.toISOString() || null,
      attempt.generationTime || null,
      JSON.stringify(attempt.qaReport || null),
      attempt.mutationSummary || null,
      attempt.id
    );
  },
};

// Export operations
export const exportDb = {
  create(export_: Export): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO exports (id, project_id, name, preset, status, output_path, error, created_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      export_.id,
      export_.projectId,
      export_.name,
      export_.preset,
      export_.status,
      export_.outputPath || null,
      export_.error || null,
      export_.createdAt.toISOString(),
      export_.completedAt?.toISOString() || null
    );
  },

  get(id: string): Export | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM exports WHERE id = ?').get(id) as any;
    if (!row) return null;
    return deserializeExport(row);
  },

  getByProject(projectId: string): Export[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM exports WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as any[];
    return rows.map(deserializeExport);
  },

  update(export_: Export): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE exports SET name = ?, preset = ?, status = ?, output_path = ?, error = ?, completed_at = ?
      WHERE id = ?
    `);
    stmt.run(
      export_.name,
      export_.preset,
      export_.status,
      export_.outputPath || null,
      export_.error || null,
      export_.completedAt?.toISOString() || null,
      export_.id
    );
  },
};

// Reference analysis operations
export const analysisDb = {
  create(analysis: ReferenceAnalysis): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO reference_analyses (id, project_id, video_asset_id, status, video, visual_style, shots, camera_language, lighting, motion_language, transitions, editing_rhythm, audio_notes, uncertainties, recreation_strategy, analyzed_at, model)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      analysis.id,
      analysis.projectId,
      analysis.videoAssetId,
      analysis.status,
      JSON.stringify(analysis.video),
      JSON.stringify(analysis.visualStyle),
      JSON.stringify(analysis.shots),
      JSON.stringify(analysis.cameraLanguage),
      JSON.stringify(analysis.lighting),
      JSON.stringify(analysis.motionLanguage),
      JSON.stringify(analysis.transitions),
      JSON.stringify(analysis.editingRhythm),
      JSON.stringify(analysis.audioNotes),
      JSON.stringify(analysis.uncertainties),
      JSON.stringify(analysis.recreationStrategy),
      analysis.analyzedAt.toISOString(),
      analysis.model
    );
  },

  get(id: string): ReferenceAnalysis | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM reference_analyses WHERE id = ?').get(id) as any;
    if (!row) return null;
    return deserializeAnalysis(row);
  },

  getByProject(projectId: string): ReferenceAnalysis | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM reference_analyses WHERE project_id = ? ORDER BY analyzed_at DESC LIMIT 1').get(projectId) as any;
    if (!row) return null;
    return deserializeAnalysis(row);
  },

  update(analysis: ReferenceAnalysis): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      UPDATE reference_analyses SET status = ?, video = ?, visual_style = ?, shots = ?, camera_language = ?, 
        lighting = ?, motion_language = ?, transitions = ?, editing_rhythm = ?, audio_notes = ?, 
        uncertainties = ?, recreation_strategy = ?, analyzed_at = ?, model = ?
      WHERE id = ?
    `);
    stmt.run(
      analysis.status,
      JSON.stringify(analysis.video),
      JSON.stringify(analysis.visualStyle),
      JSON.stringify(analysis.shots),
      JSON.stringify(analysis.cameraLanguage),
      JSON.stringify(analysis.lighting),
      JSON.stringify(analysis.motionLanguage),
      JSON.stringify(analysis.transitions),
      JSON.stringify(analysis.editingRhythm),
      JSON.stringify(analysis.audioNotes),
      JSON.stringify(analysis.uncertainties),
      JSON.stringify(analysis.recreationStrategy),
      analysis.analyzedAt.toISOString(),
      analysis.model,
      analysis.id
    );
  },
};

// Learning system operations
export const learningDb = {
  // Generation experiences
  createExperience(exp: GenerationExperience): void {
    const db = getDatabase();
    const stmt = db.prepare(`
      INSERT INTO generation_experiences (id, project_id, scene_id, model, provider, input_signature, prompt, parameters, reference_features, result_features, qa_result, defects, corrections, user_feedback, success_score, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      exp.id,
      exp.projectId,
      exp.sceneId,
      exp.model,
      exp.provider,
      exp.inputSignature,
      exp.prompt,
      JSON.stringify(exp.parameters),
      JSON.stringify(exp.referenceFeatures),
      JSON.stringify(exp.resultFeatures),
      JSON.stringify(exp.qaResult),
      JSON.stringify(exp.defects),
      JSON.stringify(exp.corrections),
      JSON.stringify(exp.userFeedback || null),
      exp.successScore,
      exp.confidence,
      exp.createdAt.toISOString()
    );
  },

  getExperiencesByProject(projectId: string): GenerationExperience[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM generation_experiences WHERE project_id = ? ORDER BY created_at DESC').all(projectId) as any[];
    return rows.map(deserializeExperience);
  },

  getExperiencesByScene(sceneId: string): GenerationExperience[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM generation_experiences WHERE scene_id = ? ORDER BY created_at DESC').all(sceneId) as any[];
    return rows.map(deserializeExperience);
  },

  getSimilarExperiences(features: ReferenceFeatures, limit = 10): GenerationExperience[] {
    const db = getDatabase();
    // Simple similarity search - in production, use vector embeddings
    const rows = db.prepare(`
      SELECT * FROM generation_experiences 
      WHERE subject_type = ? OR environment = ? OR camera_movement = ? OR style = ?
      ORDER BY success_score DESC, confidence DESC
      LIMIT ?
    `).all(features.subjectType, features.environment, features.cameraMovement, features.style, limit) as any[];
    return rows.map(deserializeExperience);
  },

  // Correction patterns
  getCorrectionPattern(defectType: string): any | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM correction_patterns WHERE defect_type = ?').get(defectType);
  },

  upsertCorrectionPattern(pattern: any): void {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM correction_patterns WHERE defect_type = ?').get(pattern.defectType);
    if (existing) {
      db.prepare(`
        UPDATE correction_patterns SET correction = ?, successful_count = ?, failed_count = ?, 
          confidence = ?, last_used = ?, examples = ?
        WHERE defect_type = ?
      `).run(pattern.correction, pattern.successfulCount, pattern.failedCount, pattern.confidence, pattern.lastUsed, JSON.stringify(pattern.examples), pattern.defectType);
    } else {
      db.prepare(`
        INSERT INTO correction_patterns (id, defect_type, correction, successful_count, failed_count, confidence, last_used, examples)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(pattern.id, pattern.defectType, pattern.correction, pattern.successfulCount, pattern.failedCount, pattern.confidence, pattern.lastUsed, JSON.stringify(pattern.examples));
    }
  },

  getAllCorrectionPatterns(): any[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM correction_patterns ORDER BY confidence DESC').all();
  },

  // Generation strategies
  getStrategies(): any[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM generation_strategies ORDER BY success_rate DESC, confidence DESC').all();
  },

  upsertStrategy(strategy: any): void {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM generation_strategies WHERE id = ?').get(strategy.id);
    if (existing) {
      db.prepare(`
        UPDATE generation_strategies SET name = ?, conditions = ?, prompt_pattern = ?, parameters = ?, 
          success_rate = ?, average_attempts = ?, average_generation_time = ?, confidence = ?, usage_count = ?
        WHERE id = ?
      `).run(strategy.name, JSON.stringify(strategy.conditions), strategy.promptPattern, JSON.stringify(strategy.parameters), strategy.successRate, strategy.averageAttempts, strategy.averageGenerationTime, strategy.confidence, strategy.usageCount, strategy.id);
    } else {
      db.prepare(`
        INSERT INTO generation_strategies (id, name, conditions, prompt_pattern, parameters, success_rate, average_attempts, average_generation_time, confidence, usage_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(strategy.id, strategy.name, JSON.stringify(strategy.conditions), strategy.promptPattern, JSON.stringify(strategy.parameters), strategy.successRate, strategy.averageAttempts, strategy.averageGenerationTime, strategy.confidence, strategy.usageCount);
    }
  },

  // Model performance
  getModelPerformance(model: string, provider: string, taskType: string): any | null {
    const db = getDatabase();
    return db.prepare('SELECT * FROM model_performance WHERE model = ? AND provider = ? AND task_type = ?').get(model, provider, taskType);
  },

  upsertModelPerformance(perf: any): void {
    const db = getDatabase();
    const existing = db.prepare('SELECT * FROM model_performance WHERE model = ? AND provider = ? AND task_type = ?').get(perf.model, perf.provider, perf.taskType);
    if (existing) {
      db.prepare(`
        UPDATE model_performance SET generations = ?, approved = ?, rejected = ?, average_attempts = ?, 
          average_generation_time = ?, common_defects = ?, last_updated = ?
        WHERE model = ? AND provider = ? AND task_type = ?
      `).run(perf.generations, perf.approved, perf.rejected, perf.averageAttempts, perf.averageGenerationTime, JSON.stringify(perf.commonDefects), perf.lastUpdated, perf.model, perf.provider, perf.taskType);
    } else {
      db.prepare(`
        INSERT INTO model_performance (id, model, provider, task_type, generations, approved, rejected, average_attempts, average_generation_time, common_defects, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(perf.id, perf.model, perf.provider, perf.taskType, perf.generations, perf.approved, perf.rejected, perf.averageAttempts, perf.averageGenerationTime, JSON.stringify(perf.commonDefects), perf.lastUpdated);
    }
  },

  getAllModelPerformance(): any[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM model_performance ORDER BY generations DESC').all();
  },
};

// Deserialization helpers
function deserializeProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    settings: JSON.parse(row.settings),
    referenceAnalysis: row.reference_analysis_id ? { id: row.reference_analysis_id } as any : undefined,
    scenes: [],
    assets: [],
    exports: [],
    learningData: row.learning_data ? JSON.parse(row.learning_data) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function deserializeScene(row: any): Scene {
  return {
    id: row.id,
    projectId: row.project_id,
    index: row.index_num,
    name: row.name,
    description: row.description,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt,
    duration: row.duration,
    status: row.status,
    attempts: [],
    approvedAttemptId: row.approved_attempt_id,
    audio: row.audio ? JSON.parse(row.audio) : undefined,
    continuityConstraints: row.continuity_constraints ? JSON.parse(row.continuity_constraints) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function deserializeAsset(row: any): Asset {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    filename: row.filename,
    mimeType: row.mime_type,
    size: row.size,
    path: row.path,
    url: row.url,
    metadata: JSON.parse(row.metadata),
    thumbnailPath: row.thumbnail_path,
    createdAt: new Date(row.created_at),
  };
}

function deserializeAttempt(row: any): GenerationAttempt {
  return {
    id: row.id,
    sceneId: row.scene_id,
    attemptNumber: row.attempt_number,
    prompt: row.prompt,
    negativePrompt: row.negative_prompt,
    parameters: JSON.parse(row.parameters),
    provider: row.provider,
    model: row.model,
    status: row.status,
    inputAssets: JSON.parse(row.input_assets),
    outputAssetId: row.output_asset_id,
    error: row.error,
    startedAt: row.started_at ? new Date(row.started_at) : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    generationTime: row.generation_time,
    qaReport: row.qa_report ? JSON.parse(row.qa_report) : undefined,
    mutationSummary: row.mutation_summary,
  };
}

function deserializeExport(row: any): Export {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    preset: row.preset,
    status: row.status,
    outputPath: row.output_path,
    error: row.error,
    createdAt: new Date(row.created_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  };
}

function deserializeAnalysis(row: any): ReferenceAnalysis {
  return {
    id: row.id,
    projectId: row.project_id,
    videoAssetId: row.video_asset_id,
    status: row.status,
    video: JSON.parse(row.video),
    visualStyle: JSON.parse(row.visual_style),
    shots: JSON.parse(row.shots),
    cameraLanguage: JSON.parse(row.camera_language),
    lighting: JSON.parse(row.lighting),
    motionLanguage: JSON.parse(row.motion_language),
    transitions: JSON.parse(row.transitions),
    editingRhythm: JSON.parse(row.editing_rhythm),
    audioNotes: JSON.parse(row.audio_notes),
    uncertainties: JSON.parse(row.uncertainties),
    recreationStrategy: JSON.parse(row.recreation_strategy),
    analyzedAt: new Date(row.analyzed_at),
    model: row.model,
  };
}

function deserializeExperience(row: any): GenerationExperience {
  return {
    id: row.id,
    projectId: row.project_id,
    sceneId: row.scene_id,
    model: row.model,
    provider: row.provider,
    inputSignature: row.input_signature,
    prompt: row.prompt,
    parameters: JSON.parse(row.parameters),
    referenceFeatures: JSON.parse(row.reference_features),
    resultFeatures: JSON.parse(row.result_features),
    qaResult: JSON.parse(row.qa_result),
    defects: JSON.parse(row.defects),
    corrections: JSON.parse(row.corrections),
    userFeedback: row.user_feedback ? JSON.parse(row.user_feedback) : undefined,
    successScore: row.success_score,
    confidence: row.confidence,
    createdAt: new Date(row.created_at),
  };
}

// Close database on process exit
process.on('exit', () => {
  if (db) {
    db.close();
    db = null;
  }
});

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}