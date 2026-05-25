-- Tighten profiles SELECT
DROP POLICY IF EXISTS profiles_select_authed ON public.profiles;

CREATE POLICY profiles_select_self
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY profiles_select_staff
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'audit.view'));

-- Tighten user_roles SELECT
DROP POLICY IF EXISTS ur_select_authed ON public.user_roles;

CREATE POLICY ur_select_self
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY ur_select_staff
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'user.assign_role'));

-- Tighten role_permissions SELECT
DROP POLICY IF EXISTS rp_select_authed ON public.role_permissions;

CREATE POLICY rp_select_staff
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (public.has_permission(auth.uid(), 'role.set_permissions'));
