---
worth: yes
where: src/components/users/ChangePasswordDialog.vue
added: 2026-11-04
---
# Changing your own password fails: the dialog never sends oldPassword

`ChangePasswordDialog` asks only for the new password, and `usersApi.setPassword` drops `oldPassword`
when it is empty. For the signed-in user's own account the server refuses
`POST /v1/users/{id}/password` without the field: 400 `Missing "oldPassword" field`, seen on a master
server with `{"newPassword": ...}`, while `{"newPassword": ..., "oldPassword": ""}` succeeded for an
account whose password was empty. So Users & Groups → own account → Change Password always fails.

Fix: when the dialog's user is the signed-in user, ask for the current password (as the legacy client
does) and always send `oldPassword`, empty string included. Not checked: whether the server also wants
it when an administrator resets another account's password.
