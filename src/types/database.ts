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
          images: string[]
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
          images?: string[]
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
          images?: string[]
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
      form_contents: {
        Row: {
          id: string
          program_id: string
          field_key: string
          content: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          program_id: string
          field_key: string
          content?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          program_id?: string
          field_key?: string
          content?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'form_contents_program_id_fkey'
            columns: ['program_id']
            isOneToOne: false
            referencedRelation: 'programs'
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
          category: string | null
          thumbnail_url: string | null
          gallery_urls: Json
          sort_order: number
          is_active: boolean
          is_open: boolean
          is_paused: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          festival_id: string
          booth_no?: string | null
          name: string
          description?: string | null
          category?: string | null
          thumbnail_url?: string | null
          gallery_urls?: Json
          sort_order?: number
          is_active?: boolean
          is_open?: boolean
          is_paused?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          festival_id?: string
          booth_no?: string | null
          name?: string
          description?: string | null
          category?: string | null
          thumbnail_url?: string | null
          gallery_urls?: Json
          sort_order?: number
          is_active?: boolean
          is_open?: boolean
          is_paused?: boolean
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
      food_categories: {
        Row: {
          id: string
          slug: string
          label: string
          sort_order: number
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          label: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          slug?: string
          label?: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
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
          is_sold_out: boolean
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
          is_sold_out?: boolean
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
          is_sold_out?: boolean
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
      surveys: {
        Row: {
          id: string
          festival_id: string | null
          gender: 'male' | 'female'
          age: number
          region: string
          name: string
          phone: string
          privacy_consented: boolean
          answers: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          festival_id?: string | null
          gender: 'male' | 'female'
          age: number
          region: string
          name: string
          phone: string
          privacy_consented?: boolean
          answers?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          festival_id?: string | null
          gender?: 'male' | 'female'
          age?: number
          region?: string
          name?: string
          phone?: string
          privacy_consented?: boolean
          answers?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'surveys_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
        ]
      }
      coupons: {
        Row: {
          id: string
          code: string
          discount_amount: number
          min_order_amount: number
          status: 'active' | 'used'
          issued_source: 'manual' | 'survey'
          issued_phone: string | null
          phone: string | null
          note: string | null
          expires_at: string
          used_at: string | null
          used_payment_id: string | null
          festival_id: string | null
          meta: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          discount_amount: number
          min_order_amount?: number
          status?: 'active' | 'used'
          issued_source?: 'manual' | 'survey'
          issued_phone?: string | null
          phone?: string | null
          note?: string | null
          expires_at: string
          used_at?: string | null
          used_payment_id?: string | null
          festival_id?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          code?: string
          discount_amount?: number
          min_order_amount?: number
          status?: 'active' | 'used'
          issued_source?: 'manual' | 'survey'
          issued_phone?: string | null
          phone?: string | null
          note?: string | null
          expires_at?: string
          used_at?: string | null
          used_payment_id?: string | null
          festival_id?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'coupons_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'coupons_used_payment_id_fkey'
            columns: ['used_payment_id']
            isOneToOne: false
            referencedRelation: 'payments'
            referencedColumns: ['id']
          },
        ]
      }
      payments: {
        Row: {
          id: string
          toss_order_id: string
          payment_key: string | null
          phone: string
          total_amount: number
          discount_amount: number
          refunded_amount: number
          coupon_id: string | null
          status: 'pending' | 'paid' | 'cancelled'
          paid_at: string | null
          cancelled_at: string | null
          festival_id: string | null
          meta: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          toss_order_id?: string
          payment_key?: string | null
          phone: string
          total_amount: number
          discount_amount?: number
          refunded_amount?: number
          coupon_id?: string | null
          status?: 'pending' | 'paid' | 'cancelled'
          paid_at?: string | null
          cancelled_at?: string | null
          festival_id?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          toss_order_id?: string
          payment_key?: string | null
          phone?: string
          total_amount?: number
          discount_amount?: number
          refunded_amount?: number
          coupon_id?: string | null
          status?: 'pending' | 'paid' | 'cancelled'
          paid_at?: string | null
          cancelled_at?: string | null
          festival_id?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payments_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
        ]
      }
      orders: {
        Row: {
          id: string
          payment_id: string
          order_number: string
          booth_id: string | null
          booth_no: string
          booth_name: string
          subtotal: number
          phone: string
          status: 'pending' | 'paid' | 'confirmed' | 'completed' | 'cancelled'
          paid_at: string | null
          confirmed_at: string | null
          estimated_minutes: number | null
          ready_at: string | null
          cancelled_at: string | null
          cancel_reason: string | null
          cancelled_by: 'booth' | 'admin' | null
          festival_id: string | null
          meta: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          payment_id: string
          order_number?: string
          booth_id?: string | null
          booth_no: string
          booth_name: string
          subtotal: number
          phone: string
          status?: 'pending' | 'paid' | 'confirmed' | 'completed' | 'cancelled'
          paid_at?: string | null
          confirmed_at?: string | null
          estimated_minutes?: number | null
          ready_at?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          cancelled_by?: 'booth' | 'admin' | null
          festival_id?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          payment_id?: string
          order_number?: string
          booth_id?: string | null
          booth_no?: string
          booth_name?: string
          subtotal?: number
          phone?: string
          status?: 'pending' | 'paid' | 'confirmed' | 'completed' | 'cancelled'
          paid_at?: string | null
          confirmed_at?: string | null
          estimated_minutes?: number | null
          ready_at?: string | null
          cancelled_at?: string | null
          cancel_reason?: string | null
          cancelled_by?: 'booth' | 'admin' | null
          festival_id?: string | null
          meta?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'orders_payment_id_fkey'
            columns: ['payment_id']
            isOneToOne: false
            referencedRelation: 'payments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'orders_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: false
            referencedRelation: 'food_booths'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'orders_festival_id_fkey'
            columns: ['festival_id']
            isOneToOne: false
            referencedRelation: 'festivals'
            referencedColumns: ['id']
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          menu_id: string | null
          menu_name: string
          menu_price: number
          quantity: number
          subtotal: number
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          menu_id?: string | null
          menu_name: string
          menu_price: number
          quantity?: number
          subtotal: number
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          menu_id?: string | null
          menu_name?: string
          menu_price?: number
          quantity?: number
          subtotal?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'order_items_menu_id_fkey'
            columns: ['menu_id']
            isOneToOne: false
            referencedRelation: 'food_menus'
            referencedColumns: ['id']
          },
        ]
      }
      booth_order_counters: {
        Row: {
          booth_id: string
          last_no: number
          updated_at: string
        }
        Insert: {
          booth_id: string
          last_no?: number
          updated_at?: string
        }
        Update: {
          booth_id?: string
          last_no?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'booth_order_counters_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: true
            referencedRelation: 'food_booths'
            referencedColumns: ['id']
          },
        ]
      }
      booth_accounts: {
        Row: {
          id: string
          booth_id: string
          login_id: string
          password_hash: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          booth_id: string
          login_id: string
          password_hash: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          booth_id?: string
          login_id?: string
          password_hash?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'booth_accounts_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: false
            referencedRelation: 'food_booths'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      booth_waiting_counts: {
        Row: {
          booth_id: string
          waiting_count: number
        }
        Relationships: [
          {
            foreignKeyName: 'booth_waiting_counts_booth_id_fkey'
            columns: ['booth_id']
            isOneToOne: false
            referencedRelation: 'food_booths'
            referencedColumns: ['id']
          },
        ]
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

// Convenience types
export type Festival = Database['public']['Tables']['festivals']['Row']
export type Program = Database['public']['Tables']['programs']['Row']
export type Application = Database['public']['Tables']['applications']['Row']
export type ApplicationInsert = Database['public']['Tables']['applications']['Insert']
export type Participant = Database['public']['Tables']['participants']['Row']
export type ParticipantInsert = Database['public']['Tables']['participants']['Insert']
export type Notice = Database['public']['Tables']['notices']['Row']
export type FoodBooth = Database['public']['Tables']['food_booths']['Row']
export type FoodMenu = Database['public']['Tables']['food_menus']['Row']
export type Payment = Database['public']['Tables']['payments']['Row']
export type PaymentInsert = Database['public']['Tables']['payments']['Insert']
export type Coupon = Database['public']['Tables']['coupons']['Row']
export type CouponInsert = Database['public']['Tables']['coupons']['Insert']
export type Survey = Database['public']['Tables']['surveys']['Row']
export type SurveyInsert = Database['public']['Tables']['surveys']['Insert']
export type Order = Database['public']['Tables']['orders']['Row']
export type OrderInsert = Database['public']['Tables']['orders']['Insert']
export type OrderItem = Database['public']['Tables']['order_items']['Row']
export type OrderItemInsert = Database['public']['Tables']['order_items']['Insert']
export type BoothAccount = Database['public']['Tables']['booth_accounts']['Row']
export type BoothAccountInsert = Database['public']['Tables']['booth_accounts']['Insert']

// Awards JSONB structure
export type AwardItem = { rank: string; prize: string }
