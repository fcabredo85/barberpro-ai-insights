
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "ai_generation_jobs": {
                  Row: {
                    "barbershop_id": string,"completed_at": string | null,"consent_id": string | null,"created_at": string,"duration_ms": number | null,"error_code": string | null,"feature": Database["public"]['Enums']["ai_feature"],"id": string,"model": string,"request_key": string,"status": Database["public"]['Enums']["ai_job_status"],"style_id": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "barbershop_id": string,"completed_at"?: string | null,"consent_id"?: string | null,"created_at"?: string,"duration_ms"?: number | null,"error_code"?: string | null,"feature": Database["public"]['Enums']["ai_feature"],"id"?: string,"model": string,"request_key": string,"status"?: Database["public"]['Enums']["ai_job_status"],"style_id"?: string | null,"user_id": string
                  }
                  Update: {
                    "barbershop_id"?: string,"completed_at"?: string | null,"consent_id"?: string | null,"created_at"?: string,"duration_ms"?: number | null,"error_code"?: string | null,"feature"?: Database["public"]['Enums']["ai_feature"],"id"?: string,"model"?: string,"request_key"?: string,"status"?: Database["public"]['Enums']["ai_job_status"],"style_id"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_generation_jobs_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_generation_jobs_consent_id_fkey"
      columns: ["consent_id"]
isOneToOne: false
      referencedRelation: "photo_consents"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_insight_requests": {
                  Row: {
                    "barbershop_id": string,"created_at": string,"id": number,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "barbershop_id": string,"created_at"?: string,"id"?: never,"user_id": string
                  }
                  Update: {
                    "barbershop_id"?: string,"created_at"?: string,"id"?: never,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_insight_requests_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    }
                  ]
                },"appointments": {
                  Row: {
                    "barber_id": string,"barbershop_id": string,"created_at": string,"created_by": string | null,"customer_name": string,"customer_phone": string | null,"ends_at": string,"id": string,"notes": string | null,"request_key": string,"sale_id": string | null,"saved_look_id": string | null,"service_id": string,"starts_at": string,"status": Database["public"]['Enums']["appointment_status"],"style_id": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "barber_id": string,"barbershop_id": string,"created_at"?: string,"created_by"?: string | null,"customer_name": string,"customer_phone"?: string | null,"ends_at": string,"id"?: string,"notes"?: string | null,"request_key": string,"sale_id"?: string | null,"saved_look_id"?: string | null,"service_id": string,"starts_at": string,"status"?: Database["public"]['Enums']["appointment_status"],"style_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "barber_id"?: string,"barbershop_id"?: string,"created_at"?: string,"created_by"?: string | null,"customer_name"?: string,"customer_phone"?: string | null,"ends_at"?: string,"id"?: string,"notes"?: string | null,"request_key"?: string,"sale_id"?: string | null,"saved_look_id"?: string | null,"service_id"?: string,"starts_at"?: string,"status"?: Database["public"]['Enums']["appointment_status"],"style_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "appointments_barber_same_shop_fkey"
      columns: ["barbershop_id","barber_id"]
isOneToOne: false
      referencedRelation: "barbers"
      referencedColumns: ["barbershop_id","id"]
    },{
      foreignKeyName: "appointments_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: true
      referencedRelation: "sales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_saved_look_id_fkey"
      columns: ["saved_look_id"]
isOneToOne: false
      referencedRelation: "saved_looks"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "appointments_service_same_shop_fkey"
      columns: ["barbershop_id","service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["barbershop_id","id"]
    }
                  ]
                },"barbers": {
                  Row: {
                    "active": boolean,"barbershop_id": string,"commission_rate": number,"created_at": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"barbershop_id": string,"commission_rate": number,"created_at"?: string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"barbershop_id"?: string,"commission_rate"?: number,"created_at"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "barbers_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    }
                  ]
                },"barbershops": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"memberships": {
                  Row: {
                    "barbershop_id": string,"created_at": string,"role": Database["public"]['Enums']["membership_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "barbershop_id": string,"created_at"?: string,"role"?: Database["public"]['Enums']["membership_role"],"user_id": string
                  }
                  Update: {
                    "barbershop_id"?: string,"created_at"?: string,"role"?: Database["public"]['Enums']["membership_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    }
                  ]
                },"photo_consents": {
                  Row: {
                    "barbershop_id": string,"granted_at": string,"id": string,"notice_version": string,"purpose": string,"recorded_by": string | null,"revoked_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "barbershop_id": string,"granted_at"?: string,"id"?: string,"notice_version": string,"purpose": string,"recorded_by"?: string | null,"revoked_at"?: string | null
                  }
                  Update: {
                    "barbershop_id"?: string,"granted_at"?: string,"id"?: string,"notice_version"?: string,"purpose"?: string,"recorded_by"?: string | null,"revoked_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "photo_consents_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    }
                  ]
                },"sales": {
                  Row: {
                    "barber_id": string,"barbershop_id": string,"commission_amount": number,"commission_rate": number,"created_at": string,"created_by": string,"gross_total": number,"id": string,"occurred_at": string,"payment_method": Database["public"]['Enums']["payment_method"],"quantity": number,"request_key": string,"service_id": string,"unit_price": number
                  }
                  ComputedFields: never
                  Insert: {
                    "barber_id": string,"barbershop_id": string,"commission_amount": number,"commission_rate": number,"created_at"?: string,"created_by"?: string,"gross_total": number,"id"?: string,"occurred_at"?: string,"payment_method": Database["public"]['Enums']["payment_method"],"quantity": number,"request_key": string,"service_id": string,"unit_price": number
                  }
                  Update: {
                    "barber_id"?: string,"barbershop_id"?: string,"commission_amount"?: number,"commission_rate"?: number,"created_at"?: string,"created_by"?: string,"gross_total"?: number,"id"?: string,"occurred_at"?: string,"payment_method"?: Database["public"]['Enums']["payment_method"],"quantity"?: number,"request_key"?: string,"service_id"?: string,"unit_price"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_barber_same_shop_fkey"
      columns: ["barbershop_id","barber_id"]
isOneToOne: false
      referencedRelation: "barbers"
      referencedColumns: ["barbershop_id","id"]
    },{
      foreignKeyName: "sales_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_service_same_shop_fkey"
      columns: ["barbershop_id","service_id"]
isOneToOne: false
      referencedRelation: "services"
      referencedColumns: ["barbershop_id","id"]
    }
                  ]
                },"saved_looks": {
                  Row: {
                    "barbershop_id": string,"created_at": string,"created_by": string | null,"customer_label": string,"delete_after": string,"favorite": boolean,"id": string,"original_path": string,"preview_path": string,"storage_consent_id": string,"style_id": string,"title": string | null,"tryon_job_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "barbershop_id": string,"created_at"?: string,"created_by"?: string | null,"customer_label": string,"delete_after": string,"favorite"?: boolean,"id": string,"original_path": string,"preview_path": string,"storage_consent_id": string,"style_id": string,"title"?: string | null,"tryon_job_id"?: string | null
                  }
                  Update: {
                    "barbershop_id"?: string,"created_at"?: string,"created_by"?: string | null,"customer_label"?: string,"delete_after"?: string,"favorite"?: boolean,"id"?: string,"original_path"?: string,"preview_path"?: string,"storage_consent_id"?: string,"style_id"?: string,"title"?: string | null,"tryon_job_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_looks_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saved_looks_storage_consent_id_fkey"
      columns: ["storage_consent_id"]
isOneToOne: false
      referencedRelation: "photo_consents"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "saved_looks_tryon_job_id_fkey"
      columns: ["tryon_job_id"]
isOneToOne: true
      referencedRelation: "ai_generation_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"services": {
                  Row: {
                    "active": boolean,"barbershop_id": string,"created_at": string,"duration_minutes": number,"id": string,"name": string,"price": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"barbershop_id": string,"created_at"?: string,"duration_minutes"?: number,"id"?: string,"name": string,"price": number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"barbershop_id"?: string,"created_at"?: string,"duration_minutes"?: number,"id"?: string,"name"?: string,"price"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "services_barbershop_id_fkey"
      columns: ["barbershop_id"]
isOneToOne: false
      referencedRelation: "barbershops"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "appointment_slots":
{ Args: { "p_barber_id": string,"p_barbershop_id": string,"p_day": string,"p_service_id": string }; Returns: Json
                           },
"book_appointment":
{ Args: { "p_barber_id": string,"p_barbershop_id": string,"p_customer_name": string,"p_customer_phone": string,"p_notes": string,"p_request_key": string,"p_saved_look_id": string,"p_service_id": string,"p_starts_at": string,"p_style_id": string }; Returns: Json
                           },
"booking_window":
{ Args: Record<PropertyKey, never>; Returns: Record<string, unknown>
                           },
"can_access_look_object":
{ Args: { "p_name": string }; Returns: boolean
                           },
"consume_ai_insight_quota":
{ Args: { "p_barbershop_id": string }; Returns: Json
                           },
"create_barbershop":
{ Args: { "p_name": string }; Returns: {
              "created_at": string,
"created_by": string,
"id": string,
"name": string,
"updated_at": string
            }
                          SetofOptions: {
        from: "*"
        to: "barbershops"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_saved_look":
{ Args: { "p_barbershop_id": string,"p_customer_label": string,"p_look_id": string,"p_notice_version": string,"p_original_path": string,"p_preview_path": string,"p_title": string,"p_tryon_job_id": string }; Returns: Json
                           },
"delete_saved_look":
{ Args: { "p_look_id": string }; Returns: boolean
                           },
"finish_ai_job":
{ Args: { "p_duration_ms"?: number,"p_error_code"?: string,"p_job_id": string,"p_status": Database["public"]['Enums']["ai_job_status"] }; Returns: boolean
                           },
"is_member":
{ Args: { "p_barbershop_id": string }; Returns: boolean
                           },
"is_owner":
{ Args: { "p_barbershop_id": string }; Returns: boolean
                           },
"sales_report":
{ Args: { "p_barbershop_id": string,"p_end": string,"p_start": string }; Returns: Json
                           },
"set_appointment_status":
{ Args: { "p_appointment_id": string,"p_payment_method"?: Database["public"]['Enums']["payment_method"],"p_status": Database["public"]['Enums']["appointment_status"] }; Returns: Json
                           },
"start_ai_job":
{ Args: { "p_barbershop_id": string,"p_consent_notice_version"?: string,"p_feature": Database["public"]['Enums']["ai_feature"],"p_model": string,"p_request_key": string,"p_style_id"?: string }; Returns: Json
                           }
          }
          Enums: {
            "ai_feature": "tryon_preview"|"hairstyle_advice","ai_job_status": "pending"|"succeeded"|"failed","appointment_status": "confirmed"|"cancelled"|"completed"|"no_show","membership_role": "owner"|"manager","payment_method": "cash"|"gcash"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "ai_feature": ["tryon_preview", "hairstyle_advice"],"ai_job_status": ["pending", "succeeded", "failed"],"appointment_status": ["confirmed", "cancelled", "completed", "no_show"],"membership_role": ["owner", "manager"],"payment_method": ["cash", "gcash"]
          }
        }
} as const
