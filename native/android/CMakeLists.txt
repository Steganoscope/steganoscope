project(SteganoscopeNative)
cmake_minimum_required(VERSION 3.9.0)

set(PACKAGE_NAME SteganoscopeNative)
set(CMAKE_CXX_STANDARD 20)

add_library(${PACKAGE_NAME} SHARED
  src/main/cpp/cpp-adapter.cpp
  ../cpp/HybridTransfer.cpp
  ../core/steganoscope.cpp
)

# The generated Nitro bindings
include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/SteganoscopeNative+autolinking.cmake)

include_directories("src/main/cpp" "../cpp" "../core")

find_library(LOG_LIB log)
target_link_libraries(${PACKAGE_NAME} ${LOG_LIB} android)
