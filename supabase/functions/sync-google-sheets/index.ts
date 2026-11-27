// Edge Function: sync-google-sheets
// Đọc dữ liệu đã kiểm tra quyền (admin / manager / accountant) và đồng bộ 1 chiều sang Google Sheets Webhook.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const webhookUrl = Deno.env.get('GOOGLE_SHEETS_WEBHOOK_URL')
  const syncSecret = Deno.env.get('GOOGLE_SHEETS_SYNC_SECRET')

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Thiếu token xác thực' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser()
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: 'Phiên đăng nhập không hợp lệ' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', caller.id)
      .single()

    if (!callerProfile?.is_active || !['admin', 'manager', 'accountant'].includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: 'Chỉ Admin / Manager / Kế toán mới được đồng bộ Google Sheets' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!webhookUrl || !syncSecret) {
      return new Response(
        JSON.stringify({
          error: 'Chưa cấu hình GOOGLE_SHEETS_WEBHOOK_URL hoặc GOOGLE_SHEETS_SYNC_SECRET trong Supabase Edge Function Secrets.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: customers } = await adminClient
      .from('customers')
      .select('customer_code, company_name, tax_code, business_type, legal_representative, phone, email, headquarters_address, created_at')
      .is('deleted_at', null)
      .order('customer_code')

    const { data: cases } = await adminClient
      .from('service_cases')
      .select('case_code, procedure_name, received_date, due_date, kanban_status, priority, customer:customers(company_name, tax_code), service:services(name), assigned_staff:profiles!service_cases_assigned_staff_id_fkey(full_name), case_financials(contract_value, incurred_cost, paid_amount, remaining_debt)')
      .order('received_date', { ascending: false })

    const customersRows = (customers || []).map((c: Record<string, unknown>) => [
      c.customer_code,
      c.company_name,
      c.tax_code || '',
      c.business_type,
      c.legal_representative || '',
      c.phone || '',
      c.email || '',
      c.headquarters_address || '',
      String(c.created_at || '').slice(0, 10)
    ])

    const casesRows = (cases || []).map((cs: Record<string, unknown>) => {
      const cust = cs.customer as Record<string, unknown> | null
      const svc = cs.service as Record<string, unknown> | null
      const staff = cs.assigned_staff as Record<string, unknown> | null
      return [
        cs.case_code,
        cust?.company_name || '',
        cust?.tax_code || '',
        svc?.name || '',
        cs.procedure_name,
        staff?.full_name || '',
        cs.received_date,
        cs.due_date || '',
        cs.priority,
        cs.kanban_status
      ]
    })

    const financeRows = (cases || []).map((cs: Record<string, unknown>) => {
      const cust = cs.customer as Record<string, unknown> | null
      const fin = cs.case_financials as Record<string, unknown> | null
      return [
        cs.case_code,
        cust?.company_name || '',
        cs.procedure_name,
        Number(fin?.contract_value || 0),
        Number(fin?.paid_amount || 0),
        Number(fin?.remaining_debt || 0),
        Number(fin?.incurred_cost || 0),
        cs.kanban_status
      ]
    })

    const gsRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: syncSecret,
        customersHeaders: ['Mã KH', 'Tên doanh nghiệp', 'MST', 'Loại hình', 'Đại diện PL', 'SĐT', 'Email', 'Địa chỉ', 'Ngày tạo'],
        customersRows,
        casesHeaders: ['Mã HS', 'Khách hàng', 'MST', 'Dịch vụ', 'Thủ tục', 'Phụ trách', 'Ngày nhận', 'Hạn xử lý', 'Ưu tiên', 'Trạng thái'],
        casesRows,
        financeHeaders: ['Mã HS', 'Khách hàng', 'Thủ tục', 'Giá hợp đồng', 'Đã thu', 'Công nợ còn lại', 'Chi phí phát sinh', 'Trạng thái'],
        financeRows
      })
    })

    const gsBody = await gsRes.json()
    if (!gsBody?.ok) {
      throw new Error(gsBody?.error || 'Google Apps Script trả về lỗi')
    }

    await adminClient.from('integration_sync_logs').insert({
      target: 'google_sheets',
      triggered_by: caller.id,
      status: 'success',
      customers_count: customersRows.length,
      cases_count: casesRows.length
    })

    return new Response(JSON.stringify(gsBody), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
