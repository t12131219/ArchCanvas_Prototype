"""Unfamiliar source computations with configuration and feature uses of extents."""
import torch
from torch import Tensor, nn


class DimensionWeave(nn.Module):
    def remap(self, value: Tensor):
        b, h, t, d = value.shape
        return value.transpose(1, 2).contiguous().view(b, t, h * d)

    def forward(self, x: Tensor, y: Tensor):
        return self.remap(torch.relu(x)) + torch.sin(torch.tanh(y))


class AliasExtent(nn.Module):
    def forward(self, x: Tensor):
        b, h, t, d = x.shape
        width = h * d
        final = width + 0
        return x.transpose(1, 2).contiguous().view(b, t, final)


class SharedExtent(nn.Module):
    def forward(self, x: Tensor):
        b, h, t, d = x.shape
        width = h * d
        return x.transpose(1, 2).contiguous().view(b, t, width) * width


class EscapingExtent(nn.Module):
    def forward(self, x: Tensor):
        b, h, t, d = x.shape
        width = h * d
        return x.transpose(1, 2).contiguous().view(b, t, width), width


class UnknownExtent(nn.Module):
    def forward(self, x: Tensor):
        b, h, t, d = x.shape
        width = unfamiliar(h * d)
        return x.transpose(1, 2).contiguous().view(b, t, width)


class ConditionalExtent(nn.Module):
    def forward(self, x: Tensor, flag):
        b, h, t, d = x.shape
        if flag:
            width = h * d
        else:
            width = d
        return x.transpose(1, 2).contiguous().view(b, t, width)


class ExtentBoundary(nn.Module):
    def forward(self, x: Tensor):
        b, h, t, d = x.shape
        return x.transpose(1, 2).contiguous().view(b, t, h * d), x.shape
