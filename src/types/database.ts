export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      programs: {
        Row: {
          id: string
          slug: string
          name: string
          category: 'writing' | 'art' | 'dance' | 'choir'
          target_divisions: string[]
          participation_type: 'individual' | 'team' | 'both'
          min_team_size: number | null
          max_team_size: number | null
          description: string | null
          requirements: string | null
          schedule: string | null
          venue: string | null
          awards: Json | null
          registration_start: string | null
          registration_end: string | null
          max_applicants: number | null
          is_active: boolean
          sort_order: number
          meta: Json
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['programs']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['programs']['Insert']>
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
        Insert: Omit<Database['public']['Tables']['applications']['Row'], 'id' | 'status' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['applications']['Insert']>
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
        Insert: Omit<Database['public']['Tables']['participants']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['participants']['Insert']>
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
        Insert: Omit<Database['public']['Tables']['notices']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['notices']['Insert']>
      }
    }
  }
}

// Convenience types
export type Program = Database['public']['Tables']['programs']['Row']
export type Application = Database['public']['Tables']['applications']['Row']
export type ApplicationInsert = Database['public']['Tables']['applications']['Insert']
export type Participant = Database['public']['Tables']['participants']['Row']
export type ParticipantInsert = Database['public']['Tables']['participants']['Insert']
export type Notice = Database['public']['Tables']['notices']['Row']
