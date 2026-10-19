cmake_minimum_required(VERSION 3.13)
project(steganoscope_core CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(steganoscope_core STATIC steganoscope.cpp)
target_include_directories(steganoscope_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

add_executable(steganoscope_core_test test.cpp)
target_link_libraries(steganoscope_core_test steganoscope_core)
