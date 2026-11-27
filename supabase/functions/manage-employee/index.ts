// Edge Function: manage-employee
// Cho phép ADMIN tạo tài khoản nhân viên mới hoặc cập nhật vai trò/trạng thái mà không lộ Service Role Key ra frontend.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Thiếu token xác thực' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Kiểm tra người gọi có đúng là ADMIN không
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

    if (!callerProfile || callerProfile.role !== 'admin' || !callerProfile.is_active) {
      return new Response(JSON.stringify({ error: 'Chỉ Quản trị viên (ADMIN) mới có quyền thực hiện' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { action } = body

    if (action === 'create') {
      const { email, password, full_name, phone, role, department_id, job_title, employee_code } = body
      if (!email || !password || !full_name) {
        return new Response(JSON.stringify({ error: 'Tên đăng nhập, mật khẩu và họ tên là bắt buộc' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, phone, role: role ?? 'staff', job_title },
      })
      if (createErr) throw createErr

      if (created.user) {
        const profilePatch: Record<string, unknown> = {
          role: role ?? 'staff',
          phone: phone || null,
          job_title: job_title || null,
        }
        if (department_id) profilePatch.department_id = department_id
        if (employee_code && String(employee_code).trim()) {
          profilePatch.employee_code = String(employee_code).trim()
        }
        await adminClient.from('profiles').update(profilePatch).eq('id', created.user.id)
      }

      return new Response(JSON.stringify({ user: created.user }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'reset_password') {
      const { user_id, new_password } = body
      if (!user_id || !new_password || new_password.length < 6) {
        return new Response(JSON.stringify({ error: 'Mật khẩu mới tối thiểu 6 ký tự' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { error } = await adminClient.auth.admin.updateUserById(user_id, { password: new_password })
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Hành động không hợp lệ' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
