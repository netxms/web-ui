IMAGE ?= netxms-console
DEMO_IMAGE ?= netxms-console-demo
PORT ?= 8080
NETXMS_WEBAPI ?= host.docker.internal:8000
VITE_MODULES ?=
VITE_FORCE_MODULES ?=

BUILD = docker build -f docker/Dockerfile \
	--build-arg VITE_MODULES=$(VITE_MODULES) --build-arg VITE_FORCE_MODULES=$(VITE_FORCE_MODULES)

.PHONY: all image demo run run-demo

all: image demo

image:
	$(BUILD) -t $(IMAGE) .

demo:
	$(BUILD) --target demo -t $(DEMO_IMAGE) .

run: image
	docker run --rm -p $(PORT):80 --add-host=host.docker.internal:host-gateway \
		-e NETXMS_WEBAPI=$(NETXMS_WEBAPI) $(IMAGE)

run-demo: demo
	docker run --rm -p $(PORT):80 $(DEMO_IMAGE)
