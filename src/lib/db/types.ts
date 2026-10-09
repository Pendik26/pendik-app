export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          count: number
          day: string
          user_id: string
        }
        Insert: {
          count?: number
          day: string
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attempts: {
        Row: {
          answers: Json
          blank_count: number | null
          correct_count: number | null
          finished_at: string | null
          flagged: string[]
          holder: string | null
          id: string
          mode: string
          option_orders: Json
          package_id: string | null
          question_ids: string[]
          question_revisions: Json
          result: Json | null
          score: number | null
          started_at: string
          status: string
          tab_leaves: number
          time_limit_minutes: number | null
          title: string | null
          user_id: string
          wrong_count: number | null
        }
        Insert: {
          answers?: Json
          blank_count?: number | null
          correct_count?: number | null
          finished_at?: string | null
          flagged?: string[]
          holder?: string | null
          id?: string
          mode: string
          option_orders?: Json
          package_id?: string | null
          question_ids: string[]
          question_revisions?: Json
          result?: Json | null
          score?: number | null
          started_at?: string
          status?: string
          tab_leaves?: number
          time_limit_minutes?: number | null
          title?: string | null
          user_id: string
          wrong_count?: number | null
        }
        Update: {
          answers?: Json
          blank_count?: number | null
          correct_count?: number | null
          finished_at?: string | null
          flagged?: string[]
          holder?: string | null
          id?: string
          mode?: string
          option_orders?: Json
          package_id?: string | null
          question_ids?: string[]
          question_revisions?: Json
          result?: Json | null
          score?: number | null
          started_at?: string
          status?: string
          tab_leaves?: number
          time_limit_minutes?: number | null
          title?: string | null
          user_id?: string
          wrong_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attempts_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      block_readiness: {
        Row: {
          block: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          block: string
          updated_at?: string
          user_id: string
          value: number
        }
        Update: {
          block?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "block_readiness_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookmarks: {
        Row: {
          created_at: string
          question_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          question_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookmarks_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookmarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_files: {
        Row: {
          block: string | null
          block_name: string | null
          category: string | null
          created_at: string
          drive_file_id: string
          drive_modified_at: string | null
          folder_path: string[]
          hidden_at: string | null
          id: string
          kind: string
          mime_type: string | null
          missing_since: string | null
          semester: number | null
          size_bytes: number | null
          sort_order: number | null
          subject: string | null
          synced_at: string
          title: string
          track: string | null
          updated_at: string
          web_url: string | null
          youtube_id: string | null
        }
        Insert: {
          block?: string | null
          block_name?: string | null
          category?: string | null
          created_at?: string
          drive_file_id: string
          drive_modified_at?: string | null
          folder_path?: string[]
          hidden_at?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          missing_since?: string | null
          semester?: number | null
          size_bytes?: number | null
          sort_order?: number | null
          subject?: string | null
          synced_at?: string
          title: string
          track?: string | null
          updated_at?: string
          web_url?: string | null
          youtube_id?: string | null
        }
        Update: {
          block?: string | null
          block_name?: string | null
          category?: string | null
          created_at?: string
          drive_file_id?: string
          drive_modified_at?: string | null
          folder_path?: string[]
          hidden_at?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          missing_since?: string | null
          semester?: number | null
          size_bytes?: number | null
          sort_order?: number | null
          subject?: string | null
          synced_at?: string
          title?: string
          track?: string | null
          updated_at?: string
          web_url?: string | null
          youtube_id?: string | null
        }
        Relationships: []
      }
      drive_sync_runs: {
        Row: {
          calls: number
          cursor: Json
          error: string | null
          files_added: number
          files_found: number
          files_missing: number
          files_updated: number
          finished_at: string | null
          id: string
          notes: Json
          started_at: string
          started_by: string
          status: string
          updated_at: string
        }
        Insert: {
          calls?: number
          cursor?: Json
          error?: string | null
          files_added?: number
          files_found?: number
          files_missing?: number
          files_updated?: number
          finished_at?: string | null
          id?: string
          notes?: Json
          started_at?: string
          started_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          calls?: number
          cursor?: Json
          error?: string | null
          files_added?: number
          files_found?: number
          files_missing?: number
          files_updated?: number
          finished_at?: string | null
          id?: string
          notes?: Json
          started_at?: string
          started_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      leaderboard_daily: {
        Row: {
          day: string
          points: number
          user_id: string
        }
        Insert: {
          day: string
          points?: number
          user_id: string
        }
        Update: {
          day?: string
          points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_daily_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_parts: {
        Row: {
          cards_learned: number
          chapters_finished: number
          correct_answers: number
          run_end: string | null
          run_length: number
          source: string
          study_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cards_learned?: number
          chapters_finished?: number
          correct_answers?: number
          run_end?: string | null
          run_length?: number
          source: string
          study_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cards_learned?: number
          chapters_finished?: number
          correct_answers?: number
          run_end?: string | null
          run_length?: number
          source?: string
          study_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_parts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      package_questions: {
        Row: {
          package_id: string
          position: number
          question_id: string
        }
        Insert: {
          package_id: string
          position: number
          question_id: string
        }
        Update: {
          package_id?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_questions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_questions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          block: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          mode: string
          source: string | null
          status: string
          time_limit_minutes: number | null
          title: string
          track: string | null
          track_best: boolean
          updated_at: string
          year: number | null
        }
        Insert: {
          block?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          mode: string
          source?: string | null
          status?: string
          time_limit_minutes?: number | null
          title: string
          track?: string | null
          track_best?: boolean
          updated_at?: string
          year?: number | null
        }
        Update: {
          block?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          mode?: string
          source?: string | null
          status?: string
          time_limit_minutes?: number | null
          title?: string
          track?: string | null
          track_best?: boolean
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "packages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          class_group: string | null
          cohort: string | null
          created_at: string
          display_name: string | null
          full_name: string
          id: string
          leaderboard_joined: boolean
          must_change_password: boolean
          role: string
          student_id: string
          track: string | null
          updated_at: string
        }
        Insert: {
          class_group?: string | null
          cohort?: string | null
          created_at?: string
          display_name?: string | null
          full_name: string
          id: string
          leaderboard_joined?: boolean
          must_change_password?: boolean
          role?: string
          student_id: string
          track?: string | null
          updated_at?: string
        }
        Update: {
          class_group?: string | null
          cohort?: string | null
          created_at?: string
          display_name?: string | null
          full_name?: string
          id?: string
          leaderboard_joined?: boolean
          must_change_password?: boolean
          role?: string
          student_id?: string
          track?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "roster"
            referencedColumns: ["student_id"]
          },
        ]
      }
      progress: {
        Row: {
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          user_id: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_imports: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          source_text: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          source_text: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          source_text?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          accepted_answers: string[] | null
          block: string
          correct_index: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          explanation: string | null
          id: string
          import_id: string | null
          import_position: number | null
          options: Json | null
          revision: number
          source: string | null
          status: string
          stem: string
          stem_image: string | null
          stem_image_alt: string | null
          subject: string | null
          type: string
          updated_at: string
          year: number | null
        }
        Insert: {
          accepted_answers?: string[] | null
          block: string
          correct_index?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          explanation?: string | null
          id?: string
          import_id?: string | null
          import_position?: number | null
          options?: Json | null
          revision?: number
          source?: string | null
          status?: string
          stem: string
          stem_image?: string | null
          stem_image_alt?: string | null
          subject?: string | null
          type: string
          updated_at?: string
          year?: number | null
        }
        Update: {
          accepted_answers?: string[] | null
          block?: string
          correct_index?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          explanation?: string | null
          id?: string
          import_id?: string | null
          import_position?: number | null
          options?: Json | null
          revision?: number
          source?: string | null
          status?: string
          stem?: string
          stem_image?: string | null
          stem_image_alt?: string | null
          subject?: string | null
          type?: string
          updated_at?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "question_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      roster: {
        Row: {
          class_group: string | null
          cohort: string
          created_at: string
          full_name: string
          student_id: string
          track: string | null
        }
        Insert: {
          class_group?: string | null
          cohort?: string
          created_at?: string
          full_name: string
          student_id: string
          track?: string | null
        }
        Update: {
          class_group?: string | null
          cohort?: string
          created_at?: string
          full_name?: string
          student_id?: string
          track?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      best_scores: {
        Row: {
          attempt_id: string | null
          finished_at: string | null
          package_id: string | null
          score: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attempts_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "package_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      package_summaries: {
        Row: {
          block: string | null
          created_at: string | null
          id: string | null
          mode: string | null
          question_count: number | null
          source: string | null
          status: string | null
          time_limit_minutes: number | null
          title: string | null
          track: string | null
          track_best: boolean | null
          updated_at: string | null
          year: number | null
        }
        Insert: {
          block?: string | null
          created_at?: string | null
          id?: string | null
          mode?: string | null
          question_count?: never
          source?: string | null
          status?: string | null
          time_limit_minutes?: number | null
          title?: string | null
          track?: string | null
          track_best?: boolean | null
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          block?: string | null
          created_at?: string | null
          id?: string | null
          mode?: string | null
          question_count?: never
          source?: string | null
          status?: string | null
          time_limit_minutes?: number | null
          title?: string | null
          track?: string | null
          track_best?: boolean | null
          updated_at?: string | null
          year?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      abandon_attempt: { Args: { p_attempt_id: string }; Returns: undefined }
      admin_import_questions: {
        Args: { p_questions: Json; p_source_text: string; p_title: string }
        Returns: string
      }
      admin_list_roster: {
        Args: never
        Returns: {
          account: string
          class_group: string
          cohort: string
          full_name: string
          google_linked: boolean
          must_change_password: boolean
          role: string
          student_id: string
          track: string
          user_id: string
        }[]
      }
      admin_packages_from_import: {
        Args: {
          p_block: string
          p_exam_title: string
          p_import_id: string
          p_practice_title: string
          p_source: string
          p_time_limit_minutes: number
          p_track_best?: boolean
          p_year: number
        }
        Returns: Json
      }
      admin_question_facets: { Args: never; Returns: Json }
      admin_set_package_status: {
        Args: { p_package_id: string; p_status: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      ai_refund: { Args: { p_user_id: string }; Returns: undefined }
      ai_take: {
        Args: { p_daily_limit: number; p_user_id: string }
        Returns: number
      }
      attempt_deadline: {
        Args: { a: Database["public"]["Tables"]["attempts"]["Row"] }
        Returns: string
      }
      attempt_expired: {
        Args: { a: Database["public"]["Tables"]["attempts"]["Row"] }
        Returns: boolean
      }
      attempt_grace_seconds: { Args: never; Returns: number }
      attempt_questions: {
        Args: {
          a: Database["public"]["Tables"]["attempts"]["Row"]
          with_keys: boolean
        }
        Returns: Json
      }
      bank_options: {
        Args: never
        Returns: {
          block: string
          bookmarked: number
          questions: number
          source: string
          subject: string
          year: number
        }[]
      }
      bank_question_ids: { Args: never; Returns: string[] }
      class_readiness: { Args: { p_block: string }; Returns: Json }
      drive_counts: {
        Args: { p_since: string }
        Returns: {
          live: number
          unseen: number
        }[]
      }
      drive_mark_missing: { Args: { p_since: string }; Returns: number }
      drive_touch_videos: {
        Args: { p_at: string; p_doc_ids: string[] }
        Returns: undefined
      }
      finish_attempt: {
        Args: { p_answers: Json; p_attempt_id: string }
        Returns: undefined
      }
      finish_my_expired_attempts: { Args: never; Returns: undefined }
      get_attempt: {
        Args: { p_attempt_id: string; p_holder?: string }
        Returns: Json
      }
      get_attempt_result: { Args: { p_attempt_id: string }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      leaderboard: {
        Args: { p_my_cohort_only?: boolean; p_period?: string }
        Returns: Json
      }
      leaderboard_set_part: {
        Args: { p: Database["public"]["Tables"]["leaderboard_parts"]["Row"] }
        Returns: undefined
      }
      leaderboard_totals: {
        Args: never
        Returns: {
          all_points: number
          cohort: string
          joined: boolean
          name: string
          stats: Json
          streak: number
          user_id: string
          week_points: number
        }[]
      }
      my_bookmarks: { Args: never; Returns: Json }
      my_track: { Args: never; Returns: string }
      package_question_count: {
        Args: { p_package_id: string }
        Returns: number
      }
      part_points: {
        Args: { p: Database["public"]["Tables"]["leaderboard_parts"]["Row"] }
        Returns: number
      }
      password_changed: { Args: never; Returns: undefined }
      require_admin: { Args: never; Returns: string }
      save_attempt: {
        Args: {
          p_answers: Json
          p_attempt_id: string
          p_flagged?: string[]
          p_holder: string
          p_tab_leaves?: number
        }
        Returns: undefined
      }
      start_attempt: {
        Args: { p_holder?: string; p_package_id: string }
        Returns: Json
      }
      start_bank_practice: {
        Args: {
          p_block: string
          p_bookmarked_only?: boolean
          p_count?: number
          p_holder?: string
          p_sources?: string[]
          p_subjects?: string[]
          p_time_limit_minutes?: number
          p_title?: string
          p_years?: number[]
        }
        Returns: Json
      }
      submit_attempt: {
        Args: { p_answers?: Json; p_attempt_id: string; p_holder: string }
        Returns: undefined
      }
      take_over_attempt: {
        Args: { p_attempt_id: string; p_holder: string }
        Returns: undefined
      }
      track_visible: { Args: { p_track: string }; Returns: boolean }
      update_my_settings: {
        Args: { p_display_name?: string; p_leaderboard_joined?: boolean }
        Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
