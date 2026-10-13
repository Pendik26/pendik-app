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
      [_ in never]: never
    }
    Views: {
      accounts: {
        Row: {
          created_at: string | null
          id: string | null
          must_change_password: boolean | null
          role: "student" | "admin" | null
          student_id: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string | null
          id?: string | null
          must_change_password?: boolean | null
          role?: "student" | "admin" | null
          student_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          must_change_password?: boolean | null
          role?: "student" | "admin" | null
          student_id?: string | null
        }
        Relationships: []
      }
      admin_package_questions: {
        Row: {
          accepted_answers: string[] | null
          correct_index: number | null
          explanation: string | null
          id: string | null
          options: Json | null
          package_id: string | null
          position: number | null
          revision: number | null
          status: string | null
          stem: string | null
          stem_image: string | null
          stem_image_alt: string | null
          subject: string | null
          type: string | null
        }
        ComputedFields: never
        Relationships: []
      }
      admin_question_stats: {
        Row: {
          answered: number | null
          correct: number | null
          options: Json | null
          question_id: string | null
        }
        ComputedFields: never
        Relationships: []
      }
      admin_questions: {
        Row: {
          accepted_answers: string[] | null
          block: string | null
          correct_index: number | null
          created_at: string | null
          explanation: string | null
          id: string | null
          import_id: string | null
          import_position: number | null
          options: Json | null
          packages: string[] | null
          revision: number | null
          source: string | null
          status: string | null
          stem: string | null
          stem_image: string | null
          stem_image_alt: string | null
          subject: string | null
          type: string | null
          year: number | null
        }
        ComputedFields: never
        Insert: {
          accepted_answers?: never
          block?: string | null
          correct_index?: never
          created_at?: string | null
          explanation?: string | null
          id?: string | null
          import_id?: string | null
          import_position?: number | null
          options?: never
          packages?: never
          revision?: number | null
          source?: string | null
          status?: never
          stem?: string | null
          stem_image?: string | null
          stem_image_alt?: string | null
          subject?: string | null
          type?: never
          year?: number | null
        }
        Update: {
          accepted_answers?: never
          block?: string | null
          correct_index?: never
          created_at?: string | null
          explanation?: string | null
          id?: string | null
          import_id?: string | null
          import_position?: number | null
          options?: never
          packages?: never
          revision?: number | null
          source?: string | null
          status?: never
          stem?: string | null
          stem_image?: string | null
          stem_image_alt?: string | null
          subject?: string | null
          type?: never
          year?: number | null
        }
        Relationships: []
      }
      attempts: {
        Row: {
          blank_count: number | null
          correct_count: number | null
          finished_at: string | null
          id: string | null
          mode: string | null
          package_id: string | null
          score: number | null
          started_at: string | null
          status: string | null
          tab_leaves: number | null
          time_limit_minutes: number | null
          title: string | null
          user_id: string | null
          wrong_count: number | null
        }
        ComputedFields: never
        Insert: {
          blank_count?: number | null
          correct_count?: number | null
          finished_at?: string | null
          id?: string | null
          mode?: never
          package_id?: string | null
          score?: number | null
          started_at?: string | null
          status?: never
          tab_leaves?: number | null
          time_limit_minutes?: number | null
          title?: string | null
          user_id?: string | null
          wrong_count?: number | null
        }
        Update: {
          blank_count?: number | null
          correct_count?: number | null
          finished_at?: string | null
          id?: string | null
          mode?: never
          package_id?: string | null
          score?: number | null
          started_at?: string | null
          status?: never
          tab_leaves?: number | null
          time_limit_minutes?: number | null
          title?: string | null
          user_id?: string | null
          wrong_count?: number | null
        }
        Relationships: []
      }
      block_readiness: {
        Row: {
          block: string | null
          updated_at: string | null
          user_id: string | null
          value: number | null
        }
        ComputedFields: never
        Insert: {
          block?: string | null
          updated_at?: string | null
          user_id?: string | null
          value?: number | null
        }
        Update: {
          block?: string | null
          updated_at?: string | null
          user_id?: string | null
          value?: number | null
        }
        Relationships: []
      }
      blocks: {
        Row: {
          id: string | null
          name: string | null
        }
        ComputedFields: never
        Insert: {
          id?: string | null
          name?: string | null
        }
        Update: {
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
      bookmarks: {
        Row: {
          created_at: string | null
          question_id: string | null
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string | null
          question_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          question_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      drive_files: {
        Row: {
          block: string | null
          block_name: string | null
          category: string | null
          created_at: string | null
          drive_file_id: string | null
          drive_modified_at: string | null
          folder_path: string[] | null
          hidden_at: string | null
          id: string | null
          kind: string | null
          mime_type: string | null
          missing_since: string | null
          semester: number | null
          size_bytes: number | null
          sort_order: number | null
          subject: string | null
          synced_at: string | null
          title: string | null
          track: string | null
          updated_at: string | null
          web_url: string | null
          youtube_id: string | null
        }
        ComputedFields: never
        Insert: {
          block?: string | null
          block_name?: string | null
          category?: string | null
          created_at?: string | null
          drive_file_id?: string | null
          drive_modified_at?: string | null
          folder_path?: string[] | null
          hidden_at?: string | null
          id?: string | null
          kind?: string | null
          mime_type?: string | null
          missing_since?: string | null
          semester?: number | null
          size_bytes?: number | null
          sort_order?: number | null
          subject?: string | null
          synced_at?: string | null
          title?: string | null
          track?: string | null
          updated_at?: string | null
          web_url?: string | null
          youtube_id?: string | null
        }
        Update: {
          block?: string | null
          block_name?: string | null
          category?: string | null
          created_at?: string | null
          drive_file_id?: string | null
          drive_modified_at?: string | null
          folder_path?: string[] | null
          hidden_at?: string | null
          id?: string | null
          kind?: string | null
          mime_type?: string | null
          missing_since?: string | null
          semester?: number | null
          size_bytes?: number | null
          sort_order?: number | null
          subject?: string | null
          synced_at?: string | null
          title?: string | null
          track?: string | null
          updated_at?: string | null
          web_url?: string | null
          youtube_id?: string | null
        }
        Relationships: []
      }
      drive_sync_runs: {
        Row: {
          calls: number | null
          cursor: Json | null
          error: string | null
          files_added: number | null
          files_found: number | null
          files_missing: number | null
          files_updated: number | null
          finished_at: string | null
          id: string | null
          notes: Json | null
          started_at: string | null
          started_by: string | null
          status: string | null
          updated_at: string | null
        }
        ComputedFields: never
        Insert: {
          calls?: number | null
          cursor?: Json | null
          error?: string | null
          files_added?: number | null
          files_found?: number | null
          files_missing?: number | null
          files_updated?: number | null
          finished_at?: string | null
          id?: string | null
          notes?: Json | null
          started_at?: string | null
          started_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          calls?: number | null
          cursor?: Json | null
          error?: string | null
          files_added?: number | null
          files_found?: number | null
          files_missing?: number | null
          files_updated?: number | null
          finished_at?: string | null
          id?: string | null
          notes?: Json | null
          started_at?: string | null
          started_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      my_account: {
        Row: {
          class_group: string | null
          cohort: string | null
          display_name: string | null
          full_name: string | null
          id: string | null
          leaderboard_joined: boolean | null
          must_change_password: boolean | null
          role: string | null
          student_id: string | null
          track: string | null
        }
        ComputedFields: never
        Relationships: []
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
        ComputedFields: never
        Insert: {
          block?: string | null
          created_at?: string | null
          id?: string | null
          mode?: never
          question_count?: never
          source?: string | null
          status?: never
          time_limit_minutes?: number | null
          title?: string | null
          track?: never
          track_best?: boolean | null
          updated_at?: string | null
          year?: number | null
        }
        Update: {
          block?: string | null
          created_at?: string | null
          id?: string | null
          mode?: never
          question_count?: never
          source?: string | null
          status?: never
          time_limit_minutes?: number | null
          title?: string | null
          track?: never
          track_best?: boolean | null
          updated_at?: string | null
          year?: number | null
        }
        Relationships: []
      }
      students: {
        Row: {
          class_group: string | null
          cohort: string | null
          created_at: string | null
          full_name: string | null
          student_id: string | null
          track: string | null
        }
        ComputedFields: never
        Insert: {
          class_group?: string | null
          cohort?: string | null
          created_at?: string | null
          full_name?: string | null
          student_id?: string | null
          track?: string | null
        }
        Update: {
          class_group?: string | null
          cohort?: string | null
          created_at?: string | null
          full_name?: string | null
          student_id?: string | null
          track?: string | null
        }
        Relationships: []
      }
      user_state: {
        Row: {
          key: string | null
          updated_at: string | null
          user_id: string | null
          value: Json | null
        }
        ComputedFields: never
        Insert: {
          key?: string | null
          updated_at?: string | null
          user_id?: string | null
          value?: Json | null
        }
        Update: {
          key?: string | null
          updated_at?: string | null
          user_id?: string | null
          value?: Json | null
        }
        Relationships: []
      }
    }
    Functions: {
      abandon_attempt: { Args: { p_attempt_id: string }; Returns: undefined }
      admin_audit_log: {
        Args: Record<PropertyKey, never>
        Returns: {
          action: string
          actor_name: string
          created_at: string
          detail: Json
          id: number
          target: string
        }[]
      }
      admin_delete_package: {
        Args: { p_package_id: string }
        Returns: undefined
      }
      admin_delete_question: {
        Args: { p_question_id: string }
        Returns: undefined
      }
      admin_import_questions: {
        Args: { p_questions: Json; p_source_text: string; p_title: string }
        Returns: string
      }
      admin_list_roster: {
        Args: Record<PropertyKey, never>
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
      admin_question_facets: { Args: Record<PropertyKey, never>; Returns: Json }
      admin_set_package_status: {
        Args: { p_package_id: string; p_status: string }
        Returns: undefined
      }
      admin_set_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      admin_update_package: {
        Args: { p_package_id: string; p_patch: Json }
        Returns: undefined
      }
      admin_update_question: {
        Args: { p_patch: Json; p_question_id: string }
        Returns: undefined
      }
      ai_refund: { Args: { p_user_id: string }; Returns: undefined }
      ai_take: {
        Args: { p_daily_limit: number; p_user_id: string }
        Returns: number
      }
      audit_account_action: {
        Args: {
          p_action: string
          p_actor: string
          p_detail?: Json
          p_target: string
        }
        Returns: undefined
      }
      bank_options: {
        Args: Record<PropertyKey, never>
        Returns: {
          block: string
          bookmarked: number
          questions: number
          source: string
          subject: string
          year: number
        }[]
      }
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
      finish_chapter: {
        Args: { p_chapter: string; p_deck: string }
        Returns: undefined
      }
      get_attempt: {
        Args: { p_attempt_id: string; p_holder?: string }
        Returns: Json
      }
      get_attempt_result: { Args: { p_attempt_id: string }; Returns: Json }
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      leaderboard: {
        Args: { p_my_cohort_only?: boolean; p_period?: string }
        Returns: Json
      }
      my_bookmarks: { Args: Record<PropertyKey, never>; Returns: Json }
      my_study_days: { Args: Record<PropertyKey, never>; Returns: string[] }
      password_changed: { Args: Record<PropertyKey, never>; Returns: undefined }
      record_quiz: { Args: { p_answers: Json }; Returns: Json }
      record_reviews: { Args: { p_items: Json }; Returns: number }
      record_study_day: { Args: Record<PropertyKey, never>; Returns: undefined }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
