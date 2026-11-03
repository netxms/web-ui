import { computed, toValue } from 'vue'
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'
import * as usersApi from '@/api/usersApi'
import { MODERATE_TIER } from './config'

export const userKeys = {
  all: () => ['users'],
  list: () => ['users', 'list'],
  detail: (id) => ['users', 'detail', id],
}

export const userGroupKeys = {
  all: () => ['userGroups'],
  list: () => ['userGroups', 'list'],
  detail: (id) => ['userGroups', 'detail', id],
}

/**
 * Display code reads this too, but the server gates it behind "manage users": a 403 is a normal
 * outcome (no toast, no retries).
 */
export function useUsers() {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: () => usersApi.getUsers({ suppressForbidden: true }),
    retry: (failureCount, error) => error?.status !== 403 && failureCount < 2,
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} userId
 */
export function useUser(userId) {
  return useQuery({
    queryKey: computed(() => userKeys.detail(toValue(userId))),
    queryFn: () => usersApi.getUser(toValue(userId)),
    enabled: computed(() => !!toValue(userId)),
    ...MODERATE_TIER,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name) => usersApi.createUser(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all() }),
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, data }) => usersApi.updateUser(userId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all() }),
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId) => usersApi.deleteUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all() }),
  })
}

export function useSetPassword() {
  return useMutation({
    mutationFn: ({ userId, newPassword, oldPassword }) =>
      usersApi.setPassword(userId, newPassword, oldPassword),
  })
}

export function useUserGroups() {
  return useQuery({
    queryKey: userGroupKeys.list(),
    queryFn: () => usersApi.getUserGroups(),
    ...MODERATE_TIER,
  })
}

/**
 * @param {import('vue').MaybeRefOrGetter} groupId
 */
export function useUserGroup(groupId) {
  return useQuery({
    queryKey: computed(() => userGroupKeys.detail(toValue(groupId))),
    queryFn: () => usersApi.getUserGroup(toValue(groupId)),
    enabled: computed(() => !!toValue(groupId)),
    ...MODERATE_TIER,
  })
}

export function useCreateUserGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name) => usersApi.createUserGroup(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userGroupKeys.all() }),
  })
}

export function useUpdateUserGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ groupId, data }) => usersApi.updateUserGroup(groupId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userGroupKeys.all() }),
  })
}

export function useDeleteUserGroup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (groupId) => usersApi.deleteUserGroup(groupId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userGroupKeys.all() }),
  })
}

export const userTwoFactorBindingKeys = {
  list: (userId) => ['users', 'detail', userId, '2fa-bindings'],
}

/**
 * @param {import('vue').MaybeRefOrGetter} userId
 */
export function useUserTwoFactorBindings(userId) {
  return useQuery({
    queryKey: computed(() => userTwoFactorBindingKeys.list(toValue(userId))),
    queryFn: () => usersApi.getUserTwoFactorBindings(toValue(userId)),
    enabled: computed(() => !!toValue(userId)),
    ...MODERATE_TIER,
  })
}

/** Or enables an existing binding. */
export function useBindUserTwoFactorMethod() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, methodName }) =>
      usersApi.updateUserTwoFactorBinding(userId, methodName, { enabled: true }),
    onSuccess: (_, { userId }) =>
      queryClient.invalidateQueries({ queryKey: userTwoFactorBindingKeys.list(userId) }),
  })
}

export function useDeleteUserTwoFactorBinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, methodName }) => usersApi.deleteUserTwoFactorBinding(userId, methodName),
    onSuccess: (_, { userId }) =>
      queryClient.invalidateQueries({ queryKey: userTwoFactorBindingKeys.list(userId) }),
  })
}

export const userTokenKeys = {
  list: (userId) => ['users', 'detail', userId, 'tokens'],
}

/**
 * @param {import('vue').MaybeRefOrGetter} userId
 */
export function useUserTokens(userId) {
  return useQuery({
    queryKey: computed(() => userTokenKeys.list(toValue(userId))),
    queryFn: () => usersApi.getUserTokens(toValue(userId)),
    enabled: computed(() => !!toValue(userId)),
    ...MODERATE_TIER,
  })
}

export function useCreateUserToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, data }) => usersApi.createUserToken(userId, data),
    onSuccess: (_, { userId }) =>
      queryClient.invalidateQueries({ queryKey: userTokenKeys.list(userId) }),
  })
}

export function useDeleteUserToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, tokenId }) => usersApi.deleteUserToken(userId, tokenId),
    onSuccess: (_, { userId }) =>
      queryClient.invalidateQueries({ queryKey: userTokenKeys.list(userId) }),
  })
}
