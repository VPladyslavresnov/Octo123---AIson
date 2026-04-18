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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          api_key: string
          created_at: string | null
          id: string
          is_default: boolean | null
          service_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          service_name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          service_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      brand_assets: {
        Row: {
          alt_text: string | null
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      brand_profiles: {
        Row: {
          brand_description: string | null
          brand_name: string | null
          competitors_mentioned: string[] | null
          content_examples: string[] | null
          content_themes: string[] | null
          created_at: string
          cta_patterns: string[] | null
          emoji_usage: boolean | null
          font_style: string | null
          hashtags: string[] | null
          id: string
          industry: string | null
          key_messages: string[] | null
          location: string | null
          posting_style: string | null
          primary_colors: string[] | null
          scraped_at: string
          screenshot_url: string | null
          secondary_colors: string[] | null
          social_data: Json | null
          source_url: string
          tagline: string | null
          target_audience_signals: string | null
          tone_of_voice: string | null
          updated_at: string
          user_id: string
          visual_style: string | null
        }
        Insert: {
          brand_description?: string | null
          brand_name?: string | null
          competitors_mentioned?: string[] | null
          content_examples?: string[] | null
          content_themes?: string[] | null
          created_at?: string
          cta_patterns?: string[] | null
          emoji_usage?: boolean | null
          font_style?: string | null
          hashtags?: string[] | null
          id?: string
          industry?: string | null
          key_messages?: string[] | null
          location?: string | null
          posting_style?: string | null
          primary_colors?: string[] | null
          scraped_at?: string
          screenshot_url?: string | null
          secondary_colors?: string[] | null
          social_data?: Json | null
          source_url: string
          tagline?: string | null
          target_audience_signals?: string | null
          tone_of_voice?: string | null
          updated_at?: string
          user_id: string
          visual_style?: string | null
        }
        Update: {
          brand_description?: string | null
          brand_name?: string | null
          competitors_mentioned?: string[] | null
          content_examples?: string[] | null
          content_themes?: string[] | null
          created_at?: string
          cta_patterns?: string[] | null
          emoji_usage?: boolean | null
          font_style?: string | null
          hashtags?: string[] | null
          id?: string
          industry?: string | null
          key_messages?: string[] | null
          location?: string | null
          posting_style?: string | null
          primary_colors?: string[] | null
          scraped_at?: string
          screenshot_url?: string | null
          secondary_colors?: string[] | null
          social_data?: Json | null
          source_url?: string
          tagline?: string | null
          target_audience_signals?: string | null
          tone_of_voice?: string | null
          updated_at?: string
          user_id?: string
          visual_style?: string | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          brand_intelligence: Json | null
          brand_source_url: string | null
          brand_style: Json | null
          channels: string[] | null
          content_mix: Json | null
          created_at: string | null
          duration_days: number | null
          id: string
          key_offers_or_topics: string[] | null
          objective: string | null
          posting_cadence_per_week: number | null
          status: string | null
          tone: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          brand_intelligence?: Json | null
          brand_source_url?: string | null
          brand_style?: Json | null
          channels?: string[] | null
          content_mix?: Json | null
          created_at?: string | null
          duration_days?: number | null
          id?: string
          key_offers_or_topics?: string[] | null
          objective?: string | null
          posting_cadence_per_week?: number | null
          status?: string | null
          tone?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          brand_intelligence?: Json | null
          brand_source_url?: string | null
          brand_style?: Json | null
          channels?: string[] | null
          content_mix?: Json | null
          created_at?: string | null
          duration_days?: number | null
          id?: string
          key_offers_or_topics?: string[] | null
          objective?: string | null
          posting_cadence_per_week?: number | null
          status?: string | null
          tone?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      company_details: {
        Row: {
          brand_colors: Json | null
          brand_source_url: string | null
          business_type: string | null
          company_name: string | null
          created_at: string | null
          id: string
          location: string | null
          preferred_model: string | null
          target_audience: string | null
          updated_at: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          brand_colors?: Json | null
          brand_source_url?: string | null
          business_type?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string
          location?: string | null
          preferred_model?: string | null
          target_audience?: string | null
          updated_at?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          brand_colors?: Json | null
          brand_source_url?: string | null
          business_type?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string
          location?: string | null
          preferred_model?: string | null
          target_audience?: string | null
          updated_at?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      creative_feedback: {
        Row: {
          created_at: string | null
          creative_id: string | null
          feedback_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          creative_id?: string | null
          feedback_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          creative_id?: string | null
          feedback_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creative_feedback_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      creatives: {
        Row: {
          alt_text: string | null
          campaign_id: string | null
          caption: string | null
          content_type: string
          created_at: string | null
          generation_metadata: Json | null
          hashtags: string[] | null
          id: string
          saved: boolean | null
          user_id: string
          visual_url: string | null
        }
        Insert: {
          alt_text?: string | null
          campaign_id?: string | null
          caption?: string | null
          content_type: string
          created_at?: string | null
          generation_metadata?: Json | null
          hashtags?: string[] | null
          id?: string
          saved?: boolean | null
          user_id: string
          visual_url?: string | null
        }
        Update: {
          alt_text?: string | null
          campaign_id?: string | null
          caption?: string | null
          content_type?: string
          created_at?: string | null
          generation_metadata?: Json | null
          hashtags?: string[] | null
          id?: string
          saved?: boolean | null
          user_id?: string
          visual_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creatives_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      post_analytics: {
        Row: {
          clicks: number | null
          comments: number | null
          engagement_rate: number | null
          fetched_at: string | null
          id: string
          impressions: number | null
          likes: number | null
          platform: string
          reach: number | null
          scheduled_post_id: string | null
          shares: number | null
          video_views: number | null
        }
        Insert: {
          clicks?: number | null
          comments?: number | null
          engagement_rate?: number | null
          fetched_at?: string | null
          id?: string
          impressions?: number | null
          likes?: number | null
          platform: string
          reach?: number | null
          scheduled_post_id?: string | null
          shares?: number | null
          video_views?: number | null
        }
        Update: {
          clicks?: number | null
          comments?: number | null
          engagement_rate?: number | null
          fetched_at?: string | null
          id?: string
          impressions?: number | null
          likes?: number | null
          platform?: string
          reach?: number | null
          scheduled_post_id?: string | null
          shares?: number | null
          video_views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_analytics_scheduled_post_id_fkey"
            columns: ["scheduled_post_id"]
            isOneToOne: false
            referencedRelation: "scheduled_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      preference_weights: {
        Row: {
          copy_preferences: Json | null
          format_preferences: Json | null
          id: string
          updated_at: string | null
          user_id: string
          visual_preferences: Json | null
        }
        Insert: {
          copy_preferences?: Json | null
          format_preferences?: Json | null
          id?: string
          updated_at?: string | null
          user_id: string
          visual_preferences?: Json | null
        }
        Update: {
          copy_preferences?: Json | null
          format_preferences?: Json | null
          id?: string
          updated_at?: string | null
          user_id?: string
          visual_preferences?: Json | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      scheduled_posts: {
        Row: {
          created_at: string | null
          creative_id: string | null
          error_message: string | null
          id: string
          platforms: string[]
          published_at: string | null
          scheduled_time: string
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          creative_id?: string | null
          error_message?: string | null
          id?: string
          platforms: string[]
          published_at?: string | null
          scheduled_time: string
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          creative_id?: string | null
          error_message?: string | null
          id?: string
          platforms?: string[]
          published_at?: string | null
          scheduled_time?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_posts_creative_id_fkey"
            columns: ["creative_id"]
            isOneToOne: false
            referencedRelation: "creatives"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connections: {
        Row: {
          access_token_encrypted: string | null
          account_name: string | null
          auto_publish: boolean | null
          connected_at: string | null
          default_schedule: Json | null
          id: string
          platform: string
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          account_name?: string | null
          auto_publish?: boolean | null
          connected_at?: string | null
          default_schedule?: Json | null
          id?: string
          platform: string
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          account_name?: string | null
          auto_publish?: boolean | null
          connected_at?: string | null
          default_schedule?: Json | null
          id?: string
          platform?: string
          user_id?: string
        }
        Relationships: []
      }
      trend_profiles: {
        Row: {
          business_type: string | null
          campaign_id: string | null
          created_at: string | null
          evidence: string | null
          hashtag_suggestions: string[] | null
          id: string
          location: string | null
          recommended_posting_windows: Json | null
          target_audience: string | null
          top_hooks_ctas: string[] | null
          top_themes: string[] | null
          top_visual_styles: string[] | null
        }
        Insert: {
          business_type?: string | null
          campaign_id?: string | null
          created_at?: string | null
          evidence?: string | null
          hashtag_suggestions?: string[] | null
          id?: string
          location?: string | null
          recommended_posting_windows?: Json | null
          target_audience?: string | null
          top_hooks_ctas?: string[] | null
          top_themes?: string[] | null
          top_visual_styles?: string[] | null
        }
        Update: {
          business_type?: string | null
          campaign_id?: string | null
          created_at?: string | null
          evidence?: string | null
          hashtag_suggestions?: string[] | null
          id?: string
          location?: string | null
          recommended_posting_windows?: Json | null
          target_audience?: string | null
          top_hooks_ctas?: string[] | null
          top_themes?: string[] | null
          top_visual_styles?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "trend_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      user_balance: {
        Row: {
          balance: number | null
          created_at: string | null
          currency: string | null
          id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      social_connections_safe: {
        Row: {
          account_name: string | null
          auto_publish: boolean | null
          connected_at: string | null
          default_schedule: Json | null
          id: string | null
          platform: string | null
          user_id: string | null
        }
        Insert: {
          account_name?: string | null
          auto_publish?: boolean | null
          connected_at?: string | null
          default_schedule?: Json | null
          id?: string | null
          platform?: string | null
          user_id?: string | null
        }
        Update: {
          account_name?: string | null
          auto_publish?: boolean | null
          connected_at?: string | null
          default_schedule?: Json | null
          id?: string | null
          platform?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
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
