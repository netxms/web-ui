import { get, post, put, del } from './client'

const NULL_GUID = '00000000-0000-0000-0000-000000000000'

/** The server reports an unset image as the all-zero guid. */
function guid(value) {
  return value && value !== NULL_GUID ? value : null
}

function fromApi(category) {
  return {
    id: category.id,
    name: category.name,
    iconImageId: guid(category.icon),
    mapImageId: guid(category.mapImage),
  }
}

function toApi(data) {
  return {
    name: data.name,
    icon: data.iconImageId ?? undefined,
    mapImage: data.mapImageId ?? undefined,
  }
}

export function getObjectCategories() {
  return get('/v1/object-categories').then((list) => list.map(fromApi))
}

export function createObjectCategory(data) {
  return post('/v1/object-categories', toApi(data)).then(fromApi)
}

export function updateObjectCategory(id, data) {
  return put(`/v1/object-categories/${id}`, toApi(data)).then(fromApi)
}

export function deleteObjectCategory(id, force = false) {
  const path = force ? `/v1/object-categories/${id}?force=true` : `/v1/object-categories/${id}`
  return del(path)
}
