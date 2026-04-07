export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      festivals: {
        Row: {
          id: string
          slug: string
          name: string
          subtitle: string | null
          description_lead: string | null
          description_body: string | null
          poster_url: string | null
          schedule: string | null
          venue: string | null
          theme_color: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          subtitle?: string | null
          description_lead?: string | null
          description_body?: string | null
          poster_url?: string | null
          schedule?: string | null
          venue?: string | null
          theme_color?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name?: string
          subtitle?: string | null
          description_lead?: string | null
          description_body?: string | null
          poster_url?: string | null
          schedule?: string | null
          venue?: string | null
          theme_color?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      programs: {
        Row: {
          id: string
          festival_id: string | null
          slug: string
          name: string
          category: 'writing' | 'art' | 'dance' | 'choir'
          target_divisions: string[]
          participation_type: 'individual' | 'team' | 'both'
          min_team_size: number | null
          max_team_size: number | null
          description: string | null
          requirements: string | null
          event_name: string | null
          schedule: string | null
          venue: string | null
          target_text: string | null
          awards: Json | null
          awards_text: string | null
          registration_period: string | null
          application_method: string | null
          thumbnail_url: string | null
          gallery_urls: Json
          registration_start: string | null
          registration_end: string | null
          max_applicants: number | null
          is_active: boolean
          sort_order: number
          meta: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          festival_id?: string | null
          slug: string
          name: string
          category: 'writing' | 'art' | 'dance' | 'choir'
          target_divisions: string[]
          participation_type: 'individual' | 'team' | 'both'
          min_team_size?: number | null
          max_team_size?: number | null
          description?: string | null
          requirements?: string | null
          event_name?: string | null
          schedule?: string | null
          venue?: string | null
          target_text?: string | null
          awards?: Json | null
          awards_text?: string | null
          registration_period?: string | null
          application_method?: string | null
          thumbnail_url?: string | null
          gallery_urls?: Json
          registration_start?: string | null
          registration_end?: string | null
          max_applicants?: number | null
          is_active?: boolean
          sort_order?: number
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          festival_id?: string | null
          slug?: string
          name?: string
          category?: 'writing' | 'art' | 'dance' | 'choir'
          target_divisions?: string[]
          participation_type?: 'individual' | 'team' | 'both'
          min_team_size?: number | null
          max_team_size?: number | null
          description?: string | null
          requirements?: string | null
          event_name?: string | null
          schedule?: string | null
          venue?: string | null
          target_text?: string | null
          awards?: Json | null
          awards_text?: string | null
          registration_period?: string | null
          application_method?: string | null
          thumbnail_url?: string | null
          gallery_urls?: Json
          registration_start?: string | null
          registration_end?: string | null
          max_applicants?: number | null
          is_active?: boolean
          sort_order?: number
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'programs_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
        ]
      }
      applications: {
        Row: {
          id: string
          program_id: string
          division: string
          participation_type: 'individual' | 'team'
          team_name: string | null
          applicant_name: string
          applicant_birth: string | null
          school_name: string
          school_grade: string | null
          phone: string
          email: string | null
          parent_name: string | null
          parent_phone: string | null
          parent_relation: string | null
          teacher_name: string | null
          teacher_phone: string | null
          teacher_email: string | null
          teacher_subject: string | null
          status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'waitlist'
          admin_memo: string | null
          rejection_reason: string | null
          privacy_agreed: boolean
          privacy_agreed_at: string | null
          meta: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          program_id: string
          division: string
          participation_type: 'individual' | 'team'
          team_name?: string | null
          applicant_name: string
          applicant_birth?: string | null
          school_name: string
          school_grade?: string | null
          phone: string
          email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          parent_relation?: string | null
          teacher_name?: string | null
          teacher_phone?: string | null
          teacher_email?: string | null
          teacher_subject?: string | null
          status?: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'waitlist'
          admin_memo?: string | null
          rejection_reason?: string | null
          privacy_agreed: boolean
          privacy_agreed_at?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          program_id?: string
          division?: string
          participation_type?: 'individual' | 'team'
          team_name?: string | null
          applicant_name?: string
          applicant_birth?: string | null
          school_name?: string
          school_grade?: string | null
          phone?: string
          email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          parent_relation?: string | null
          teacher_name?: string | null
          teacher_phone?: string | null
          teacher_email?: string | null
          teacher_subject?: string | null
          status?: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'waitlist'
          admin_memo?: string | null
          rejection_reason?: string | null
          privacy_agreed?: boolean
          privacy_agreed_at?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'applications_program_id_fkey'
            columns: ['program_id']
            isOneToOne: false
            referencedRelation: 'programs'
            referencedColumns: ['id']
          },
        ]
      }
      participants: {
        Row: {
          id: string
          application_id: string
          name: string
          birth: string | null
          school_name: string | null
          school_grade: string | null
          role: string | null
          is_leader: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          application_id: string
          name: string
          birth?: string | null
          school_name?: string | null
          school_grade?: string | null
          role?: string | null
          is_leader?: boolean
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: string
          application_id?: string
          name?: string
          birth?: string | null
          school_name?: string | null
          school_grade?: string | null
          role?: string | null
          is_leader?: boolean
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'participants_application_id_fkey'
            columns: ['application_id']
            isOneToOne: false
            referencedRelation: 'applications'
            referencedColumns: ['id']
          },
        ]
      }
      notices: {
        Row: {
          id: string
          title: string
          content: string
          category: 'general' | 'program' | 'result'
          is_pinned: boolean
          is_published: boolean
          published_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          content: string
          category?: 'general' | 'program' | 'result'
          is_pinned?: boolean
          is_published?: boolean
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          content?: string
          category?: 'general' | 'program' | 'result'
          is_pinned?: boolean
          is_published?: boolean
          published_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      festival_events: {
        Row: {
          id: string
          festival_id: string
          slug: string | null
          name: string
          kind: 'opening' | 'closing' | 'program'
          schedule: string | null
          venue: string | null
          description: string | null
          thumbnail_url: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          festival_id: string
          slug?: string | null
          name: string
          kind?: 'opening' | 'closing' | 'program'
          schedule?: string | null
          venue?: string | null
          description?: string | null
          thumbnail_url?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          festival_id?: string
          slug?: string | null
          name?: string
          kind?: 'opening' | 'closing' | 'program'
          schedule?: string | null
          venue?: string | null
          description?: string | null
          thumbnail_url?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'festival_events_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
        ]
      }
      festival_guests: {
        Row: {
          id: string
          festival_id: string
          name: string
          description: string | null
          photo_url: string | null
          link_url: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          festival_id: string
          name: string
          description?: string | null
          photo_url?: string | null
          link_url?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          festival_id?: string
          name?: string
          description?: string | null
          photo_url?: string | null
          link_url?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'festival_guests_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
        ]
      }
      food_booths: {
        Row: {
          id: string
          festival_id: string
          booth_no: string | null
          name: string
          description: string | null
          category: 'korean' | 'chinese' | 'japanese' | 'fusion' | null
          thumbnail_url: string | null
          gallery_urls: Json
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          festival_id: string
          booth_no?: string | null
          name: string
          description?: string | null
          category?: 'korean' | 'chinese' | 'japanese' | 'fusion' | null
          thumbnail_url?: string | null
          gallery_urls?: Json
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          festival_id?: string
          booth_no?: string | null
          name?: string
          description?: string | null
          category?: 'korean' | 'chinese' | 'japanese' | 'fusion' | null
          thumbnail_url?: string | null
          gallery_urls?: Json
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'food_booths_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
        ]
      }
      food_menus: {
        Row: {
          id: string
          booth_id: string
          name: string
          price: number | null
          description: string | null
          image_url: string | null
          is_signature: boolean
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          booth_id: string
          name: string
          price?: number | null
          description?: string | null
          image_url?: string | null
          is_signature?: boolean
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          booth_id?: string
          name?: string
          price?: number | null
          description?: string | null
          image_url?: string | null
          is_signature?: boolean
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'food_menus_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: false
            referencedRelation: 'food_booths'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
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

// Convenience types
export type Festival = Database['public']['Tables']['festivals']['Row']
export type Program = Database['public']['Tables']['programs']['Row']
export type Application = Database['public']['Tables']['applications']['Row']
export type ApplicationInsert = Database['public']['Tables']['applications']['Insert']
export type Participant = Database['public']['Tables']['participants']['Row']
export type ParticipantInsert = Database['public']['Tables']['participants']['Insert']
export type Notice = Database['public']['Tables']['notices']['Row']

// Awards JSONB structure
export type AwardItem = { rank: string; prize: string }
