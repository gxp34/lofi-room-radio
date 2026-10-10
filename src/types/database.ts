/**
 * 数据库类型定义（手写，与 supabase/migrations/*.sql 一一对应）。
 *
 * 为什么不直接用 `supabase gen types typescript`？
 * 因为那份生成结果会把所有注释丢掉，而且 CI 里没有 Supabase CLI 就生成不了。
 * 手写这份能带上中文注释，字段含义一眼就能看懂。
 * 如果你改了表结构，记得同步改这里（或者重新生成覆盖）。
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/* ==========================================================================
   枚举（数据库里用 text + check 约束实现，这里用联合类型对齐）
   ========================================================================== */

/** 账号角色 */
export type UserRole = 'admin' | 'visitor'
/** 歌曲可见性 */
export type TrackVisibilityDb = 'public' | 'private'
/** 日记 / 手帐可见性 */
export type DiaryVisibilityDb = 'draft' | 'public' | 'private' | 'password'
/** 树洞可见范围 */
export type TreeholeVisibilityDb = 'public' | 'admin' | 'private'
/** 事件触发方式 */
export type EventTriggerDb =
  | 'click'
  | 'dblclick'
  | 'longpress'
  | 'combo'
  | 'night'
  | 'first'
  | 'random'
  | 'global'
/** 事件稀有度 */
export type EventRarityDb = 'common' | 'rare' | 'hidden'

/* ==========================================================================
   Database
   ========================================================================== */

export type Database = {
  public: {
    Tables: {
      /* ---------------- profiles ---------------- */
      profiles: {
        Row: {
          id: string
          email: string | null
          display_name: string | null
          role: UserRole
          created_at: string
        }
        Insert: {
          id: string
          email?: string | null
          display_name?: string | null
          role?: UserRole
          created_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          display_name?: string | null
          role?: UserRole
          created_at?: string
        }
        Relationships: []
      }

      /* ---------------- tracks ---------------- */
      tracks: {
        Row: {
          id: string
          title: string
          artist: string | null
          cover_path: string | null
          audio_path: string
          duration: number | null
          tags: string[]
          note: string | null
          visibility: TrackVisibilityDb
          sort: number
          play_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          artist?: string | null
          cover_path?: string | null
          audio_path: string
          duration?: number | null
          tags?: string[]
          note?: string | null
          visibility?: TrackVisibilityDb
          sort?: number
          play_count?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          artist?: string | null
          cover_path?: string | null
          audio_path?: string
          duration?: number | null
          tags?: string[]
          note?: string | null
          visibility?: TrackVisibilityDb
          sort?: number
          play_count?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      /* ---------------- diaries（图文手帐） ---------------- */
      diaries: {
        Row: {
          id: string
          title: string
          content: string
          mood: string | null
          weather: string | null
          tags: string[]
          cover_path: string | null
          visibility: DiaryVisibilityDb
          published_at: string | null
          created_at: string
          updated_at: string
          /** 封面照片在存储桶里的路径 */
          cover_photo: string | null
          sort: number
          /** 置顶：前台排最前面 */
          is_pinned: boolean
          /** 口令手帐的 bcrypt 哈希；正文永远不通过 RLS 暴露 */
          password_hash: string | null
          /** 正文墨水颜色（#rrggbb）；null = 默认墨黑。见 0008_journal_ink.sql */
          text_color: string | null
        }
        Insert: {
          id?: string
          title: string
          content: string
          mood?: string | null
          weather?: string | null
          tags?: string[]
          cover_path?: string | null
          visibility?: DiaryVisibilityDb
          published_at?: string | null
          created_at?: string
          updated_at?: string
          cover_photo?: string | null
          sort?: number
          is_pinned?: boolean
          password_hash?: string | null
          text_color?: string | null
        }
        Update: {
          id?: string
          title?: string
          content?: string
          mood?: string | null
          weather?: string | null
          tags?: string[]
          cover_path?: string | null
          visibility?: DiaryVisibilityDb
          published_at?: string | null
          created_at?: string
          updated_at?: string
          cover_photo?: string | null
          sort?: number
          is_pinned?: boolean
          password_hash?: string | null
          text_color?: string | null
        }
        Relationships: []
      }

      /* ---------------- journal_photos（手帐照片） ---------------- */
      journal_photos: {
        Row: {
          id: string
          entry_id: string
          storage_path: string
          thumb_path: string | null
          caption: string | null
          sort: number
          width: number | null
          height: number | null
          created_at: string
        }
        Insert: {
          id?: string
          entry_id: string
          storage_path: string
          thumb_path?: string | null
          caption?: string | null
          sort?: number
          width?: number | null
          height?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          entry_id?: string
          storage_path?: string
          thumb_path?: string | null
          caption?: string | null
          sort?: number
          width?: number | null
          height?: number | null
          created_at?: string
        }
        Relationships: []
      }

      /* ---------------- treehole_messages ---------------- */
      treehole_messages: {
        Row: {
          id: string
          nickname: string
          content: string
          mood: string | null
          visibility: TreeholeVisibilityDb
          is_approved: boolean
          is_hidden: boolean
          is_flagged: boolean
          report_count: number
          ip_hash: string | null
          created_at: string
        }
        Insert: {
          id?: string
          nickname?: string
          content: string
          mood?: string | null
          visibility?: TreeholeVisibilityDb
          is_approved?: boolean
          is_hidden?: boolean
          is_flagged?: boolean
          report_count?: number
          ip_hash?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          nickname?: string
          content?: string
          mood?: string | null
          visibility?: TreeholeVisibilityDb
          is_approved?: boolean
          is_hidden?: boolean
          is_flagged?: boolean
          report_count?: number
          ip_hash?: string | null
          created_at?: string
        }
        Relationships: []
      }

      /* ---------------- treehole_replies ---------------- */
      treehole_replies: {
        Row: {
          id: string
          message_id: string
          content: string
          is_admin: boolean
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          content: string
          is_admin?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          message_id?: string
          content?: string
          is_admin?: boolean
          created_at?: string
        }
        Relationships: []
      }

      /* ---------------- games ---------------- */
      games: {
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          enabled: boolean
          config: Json
          sort: number
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          description?: string | null
          enabled?: boolean
          config?: Json
          sort?: number
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          description?: string | null
          enabled?: boolean
          config?: Json
          sort?: number
          created_at?: string
        }
        Relationships: []
      }

      /* ---------------- game_scores ---------------- */
      game_scores: {
        Row: {
          id: string
          game_slug: string
          player_name: string
          score: number
          session_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          game_slug: string
          player_name?: string
          score: number
          session_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          game_slug?: string
          player_name?: string
          score?: number
          session_id?: string | null
          created_at?: string
        }
        Relationships: []
      }

      /* ---------------- game_saves（小游戏存档，见 0009） ---------------- */
      game_saves: {
        Row: {
          id: string
          user_id: string
          game_slug: string
          /** 不透明状态，只有对应游戏自己解析 */
          state_json: Json
          updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          game_slug: string
          state_json?: Json
          updated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          game_slug?: string
          state_json?: Json
          updated_at?: string
          created_at?: string
        }
        Relationships: []
      }

      /* ---------------- events ---------------- */
      events: {
        Row: {
          id: string
          object_type: string
          event_key: string
          text: string
          action: string | null
          trigger: EventTriggerDb
          rarity: EventRarityDb
          weight: number
          cooldown_seconds: number
          once: boolean
          conditions: Json
          deep_night_only: boolean
          consecutive_days: number | null
          enabled: boolean
          sort: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          object_type: string
          event_key: string
          text: string
          action?: string | null
          trigger?: EventTriggerDb
          rarity?: EventRarityDb
          weight?: number
          cooldown_seconds?: number
          once?: boolean
          conditions?: Json
          deep_night_only?: boolean
          consecutive_days?: number | null
          enabled?: boolean
          sort?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          object_type?: string
          event_key?: string
          text?: string
          action?: string | null
          trigger?: EventTriggerDb
          rarity?: EventRarityDb
          weight?: number
          cooldown_seconds?: number
          once?: boolean
          conditions?: Json
          deep_night_only?: boolean
          consecutive_days?: number | null
          enabled?: boolean
          sort?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }

      /* ---------------- achievements ---------------- */
      achievements: {
        Row: {
          id: string
          key: string
          name: string
          description: string | null
          icon: string | null
          secret: boolean
          sort: number
          created_at: string
        }
        Insert: {
          id?: string
          key: string
          name: string
          description?: string | null
          icon?: string | null
          secret?: boolean
          sort?: number
          created_at?: string
        }
        Update: {
          id?: string
          key?: string
          name?: string
          description?: string | null
          icon?: string | null
          secret?: boolean
          sort?: number
          created_at?: string
        }
        Relationships: []
      }

      /* ---------------- user_achievements ---------------- */
      user_achievements: {
        Row: {
          id: string
          user_id: string
          achievement_key: string
          unlocked_at: string
        }
        Insert: {
          id?: string
          user_id: string
          achievement_key: string
          unlocked_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          achievement_key?: string
          unlocked_at?: string
        }
        Relationships: []
      }

      /* ---------------- site_settings ---------------- */
      site_settings: {
        Row: {
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          key: string
          value?: Json
          updated_at?: string
        }
        Update: {
          key?: string
          value?: Json
          updated_at?: string
        }
        Relationships: []
      }

      /* ---------------- media ---------------- */
      media: {
        Row: {
          id: string
          bucket: string
          path: string
          type: string | null
          size: number | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          bucket: string
          path: string
          type?: string | null
          size?: number | null
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          bucket?: string
          path?: string
          type?: string | null
          size?: number | null
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: []
      }

      /* ---------------- event_logs ---------------- */
      event_logs: {
        Row: {
          id: number
          session_id: string
          event_key: string
          object_type: string | null
          meta: Json
          created_at: string
        }
        Insert: {
          id?: number
          session_id: string
          event_key: string
          object_type?: string | null
          meta?: Json
          created_at?: string
        }
        Update: {
          id?: number
          session_id?: string
          event_key?: string
          object_type?: string | null
          meta?: Json
          created_at?: string
        }
        Relationships: []
      }
    }

    Views: {
      [_ in never]: never
    }

    Functions: {
      /** 当前会话是不是站长 */
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      /** 举报一条树洞留言，累计 3 次自动标记待审 */
      report_treehole_message: {
        Args: { p_id: string }
        Returns: undefined
      }
      /** 播放计数 +1（只对公开歌曲生效） */
      increment_play_count: {
        Args: { p_track_id: string }
        Returns: undefined
      }
      /** 记一次页面访问 */
      log_visit: {
        Args: { p_session_id: string; p_path: string }
        Returns: undefined
      }
      /** 后台仪表盘的聚合统计（一次请求拿全） */
      admin_overview: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      /** 后台导出：diaries / treehole / tracks / events / achievements / settings */
      admin_export: {
        Args: { p_kind: string }
        Returns: Json
      }
      /** 校验口令手帐（只返回 true/false） */
      journal_check_password: {
        Args: { p_id: string; p_password: string }
        Returns: boolean
      }
      /** 设置 / 清除手帐口令（仅站长） */
      journal_set_password: {
        Args: { p_id: string; p_password: string }
        Returns: undefined
      }
      /** 上锁手帐的清单：只给标题日期，不给正文和照片 */
      journal_locked_entries: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
    }

    Enums: {
      [_ in never]: never
    }

    CompositeTypes: {
      [_ in never]: never
    }
  }
}

/* ==========================================================================
   便捷别名（用法：Tables<'tracks'>）
   ========================================================================== */

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

export type DbFunctions<T extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][T]
