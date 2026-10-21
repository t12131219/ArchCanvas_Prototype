"""Static-only unfamiliar regions with guarded and unresolved boundary uses."""
import torch
from torch import nn


class ConditionalWorkshop(nn.Module):
    def weave(self, signal, context):
        a = torch.sin(torch.cos(torch.relu(signal)))
        b = torch.cos(torch.tanh(torch.sin(signal)))
        c = torch.relu(torch.sin(torch.cos(signal)))
        f = torch.cat((a, b, c), dim=-1)
        if context is not None:
            f = f * context
            f = f + context
        return torch.tanh(f)

    def forward(self, seed, signal, context):
        return self.weave(signal, context) + seed


class UnknownWorkshop(nn.Module):
    def weave(self, signal, context):
        a = torch.sin(torch.cos(torch.relu(signal)))
        b = torch.cos(torch.tanh(torch.sin(signal)))
        c = torch.relu(torch.sin(torch.cos(signal)))
        f = torch.cat((a, b, c), dim=-1)
        g = external_unresolved(f, context)
        return torch.tanh(g) + context

    def forward(self, seed, signal, context):
        return self.weave(signal, context) + seed


class MutableWorkshop(nn.Module):
    def weave(self, signal, context):
        a = torch.sin(torch.cos(torch.relu(signal)))
        b = torch.cos(torch.tanh(torch.sin(signal)))
        c = torch.relu(torch.sin(torch.cos(signal)))
        f = torch.cat((a, b, c), dim=-1)
        context.add_(f)
        return torch.tanh(f * context) + context

    def forward(self, seed, signal, context):
        return self.weave(signal, context) + seed


class UnknownBraided(nn.Module):
    def produce(self, seed, context):
        a = torch.sin(torch.cos(torch.relu(seed)))
        b = torch.cos(torch.tanh(torch.sin(seed)))
        c = torch.relu(torch.sin(torch.cos(seed)))
        f = torch.cat((a, b, c), dim=-1)
        return torch.sigmoid(f + context) * (f * context)

    def receive(self, signal, context, previous):
        a = torch.sin(torch.cos(torch.relu(signal)))
        b = torch.cos(torch.tanh(torch.sin(signal)))
        c = torch.relu(torch.sin(torch.cos(signal)))
        f = torch.cat((a, b, c), dim=-1)
        g = external_unresolved(f, context, previous)
        return torch.tanh(g * context) + previous

    def forward(self, seed, signal, context):
        left = self.produce(seed, context)
        right = self.produce(signal, context)
        return self.receive(signal, context, left + right)
