-- Append Telegram photos atomically: photo albums arrive in concurrent webhook requests.
create or replace function public.gym_telegram_append_image(
  p_chat_id text,
  p_message_id bigint,
  p_file_id text,
  p_mime text,
  p_caption text default ''
)
returns public.telegram_issue_drafts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_draft public.telegram_issue_drafts;
begin
  insert into public.telegram_issue_drafts (chat_id)
  values (p_chat_id)
  on conflict (chat_id) do nothing;

  select * into v_draft
  from public.telegram_issue_drafts
  where chat_id = p_chat_id
  for update;

  if not exists (
    select 1
    from jsonb_array_elements(v_draft.images) image
    where image->>'messageId' = p_message_id::text
  ) then
    if jsonb_array_length(v_draft.images) >= 6 then
      raise exception 'TOO_MANY_IMAGES' using errcode = 'P0001';
    end if;

    update public.telegram_issue_drafts
    set images = v_draft.images || jsonb_build_array(jsonb_build_object(
          'fileId', p_file_id, 'messageId', p_message_id, 'mime', p_mime
        )),
        description = case
          when coalesce(trim(p_caption), '') = '' then v_draft.description
          when v_draft.description = '' then trim(p_caption)
          else v_draft.description || E'\n\n' || trim(p_caption)
        end,
        updated_at = clock_timestamp()
    where chat_id = p_chat_id
    returning * into v_draft;
  end if;

  return v_draft;
end;
$$;

revoke all on function public.gym_telegram_append_image(text,bigint,text,text,text)
  from public, anon, authenticated;
grant execute on function public.gym_telegram_append_image(text,bigint,text,text,text)
  to service_role;
