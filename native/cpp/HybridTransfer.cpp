#include "HybridTransfer.hpp"

#include <cmath>
#include <stdexcept>

namespace margelo::nitro::steganoscopenative {

std::string HybridTransfer::getProtocol() { return std::string(::steganoscope::PROTOCOL); }

std::shared_ptr<HybridTransferReceiverSpec> HybridTransfer::createReceiver(double maxStreams) {
  if (!(maxStreams >= 1 && maxStreams <= 64)) throw std::invalid_argument("maxStreams must be between 1 and 64");
  return std::make_shared<HybridTransferReceiver>(size_t(maxStreams));
}

std::shared_ptr<HybridTransferEncoderSpec> HybridTransfer::createEncoder(const std::shared_ptr<ArrayBuffer>& container, double block) {
  if (!(block >= 1 && block <= ::steganoscope::MAX_B)) throw std::invalid_argument("block out of range");
  // The buffer belongs to JavaScript: copy it now, on its thread.
  const uint8_t* data = container->data();
  ::steganoscope::Bytes bytes(data, data + container->size());
  return std::make_shared<HybridTransferEncoder>(bytes, uint32_t(block));
}

static PushStatus status(::steganoscope::Pushed::Status s) {
  switch (s) {
    case ::steganoscope::Pushed::Progress: return PushStatus::PROGRESS;
    case ::steganoscope::Pushed::Ready: return PushStatus::READY;
    case ::steganoscope::Pushed::Corrupt: return PushStatus::CORRUPT;
    default: return PushStatus::IGNORED;
  }
}

Pushed HybridTransferReceiver::push(const std::string& frame, double now) {
  std::lock_guard<std::mutex> guard(lock_);
  const ::steganoscope::Pushed r = rx_.push(frame, now);
  return Pushed(status(r.status), r.id, r.n, r.len, r.rank);
}

std::shared_ptr<Promise<Assembled>> HybridTransferReceiver::finish(const std::string& id) {
  std::optional<::steganoscope::Decoder> d;
  {
    std::lock_guard<std::mutex> guard(lock_);
    d = rx_.take(id);
  }
  if (!d) return Promise<Assembled>::resolved(Assembled(id, std::nullopt, std::string("not ready")));
  auto decoder = std::make_shared<::steganoscope::Decoder>(std::move(*d));
  // Keeps this receiver alive until the work is done, even if JavaScript lets go of it.
  auto self = shared_cast<HybridTransferReceiver>();
  return Promise<Assembled>::async([self, id, decoder]() {
    ::steganoscope::Pushed r = ::steganoscope::Receiver::assemble(id, *decoder);
    if (r.status != ::steganoscope::Pushed::Complete) {
      std::lock_guard<std::mutex> guard(self->lock_);
      self->rx_.hold(id, 0);  // a corrupt stream may be received again at once
      return Assembled(id, std::nullopt, std::string("corrupt stream"));
    }
    return Assembled(id, ArrayBuffer::copy(r.container), std::nullopt);
  });
}

void HybridTransferReceiver::hold(const std::string& id, double until) {
  std::lock_guard<std::mutex> guard(lock_);
  rx_.hold(id, until);
}

std::string HybridTransferEncoder::frame(double seed) {
  if (!(seed >= 0 && seed <= 4294967295.0) || std::floor(seed) != seed) throw std::invalid_argument("seed must be a 32-bit unsigned integer");
  return enc_.frame(uint32_t(seed));
}

}  // namespace margelo::nitro::steganoscopenative
